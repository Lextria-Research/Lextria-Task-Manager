// src/attachmentUtils.js

/**
 * Parses query ticket payload into author, cleanText, and attachments list.
 */
export function parseTicketData(ticket, agentList = []) {
  if (!ticket) return { text: '', attachments: [], authorName: 'Member', authorRole: 'member' };
  const rawQuery = ticket.query || '';
  let authorName = 'Member';
  let authorRole = 'member';
  let cleanText = rawQuery;
  let attachments = [];

  // 1. Extract [AUTHOR]:{"name":"...","role":"..."}
  const authorMarker = '[AUTHOR]:';
  if (cleanText.includes(authorMarker)) {
    const startIdx = cleanText.indexOf(authorMarker) + authorMarker.length;
    const endIdx = cleanText.indexOf('\n', startIdx);
    const jsonStr = endIdx === -1 ? cleanText.substring(startIdx).trim() : cleanText.substring(startIdx, endIdx).trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.name) authorName = parsed.name;
      if (parsed.role) authorRole = parsed.role;
    } catch {}
    cleanText = endIdx === -1 ? '' : cleanText.substring(endIdx).trim();
  } else if (ticket.created_by && agentList && agentList.length > 0) {
    const found = agentList.find(a => a.id === ticket.created_by);
    if (found) {
      authorName = found.name;
    } else if (ticket.created_by_name || ticket.author_name || ticket.author) {
      authorName = ticket.created_by_name || ticket.author_name || ticket.author;
    }
  } else if (ticket.created_by_name || ticket.author_name || ticket.author) {
    authorName = ticket.created_by_name || ticket.author_name || ticket.author;
  }

  if (cleanText.includes('[QUERY]:')) {
    cleanText = cleanText.replace(/\[QUERY\]:\s*/i, '').trim();
  }

  // 2. Extract [ATTACHMENTS]:[...]
  const attMarker = '[ATTACHMENTS]:';
  if (cleanText.includes(attMarker)) {
    const idx = cleanText.indexOf(attMarker);
    const jsonStr = cleanText.substring(idx + attMarker.length).trim();
    cleanText = cleanText.substring(0, idx).trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch {}
  }

  return { text: cleanText, attachments, authorName, authorRole };
}

/**
 * Checks if an attachment is an image (by MIME type, base64 header, or file extension).
 */
export function isImageAttachment(att) {
  if (!att) return false;
  // 1. Data URL image preview check
  if (att.preview && typeof att.preview === 'string' && att.preview.startsWith('data:image/')) {
    return true;
  }
  // 2. Check explicit MIME type
  if (att.type && typeof att.type === 'string') {
    if (att.type.startsWith('image/')) return true;
    // Known non-image document types
    if (/^application\/(pdf|msword|vnd\.|zip|x-tar|x-rar|gzip)/i.test(att.type) || /^text\/(plain|csv|html)/i.test(att.type)) {
      return false;
    }
  }
  // 3. Check filename or URL extension
  const strToCheck = (att.name || att.url || (typeof att.preview === 'string' && att.preview.startsWith('http') ? att.preview : '')).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|heic|tiff?)(\?.*)?$/i.test(strToCheck)) {
    return true;
  }
  return false;
}

/**
 * Resolves the displayable image source URL/base64 from an attachment object.
 */
export function getImageSrc(att) {
  if (!att) return '';
  if (att.preview && typeof att.preview === 'string' && (att.preview.startsWith('data:image/') || att.preview.startsWith('http') || att.preview.startsWith('blob:'))) {
    return att.preview;
  }
  if (att.url && typeof att.url === 'string') {
    const isZoho = /workdrive\.zoho/i.test(att.url);
    const isDirectImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(att.url);
    if (!isZoho && isDirectImage) return att.url;
  }
  if (att.preview && typeof att.preview === 'string' && !att.preview.startsWith('data:application/') && att.preview.trim() !== '') {
    return att.preview;
  }
  return '';
}

export const BOARDS = [
  { key: 'litigation', label: 'Litigation', prefix: 'LIT' },
  { key: 'compliance', label: 'Compliance', prefix: 'CMP' },
  { key: 'misc', label: 'Miscellaneous', prefix: 'MISC' },
  { key: 'patent', label: 'Patent', prefix: 'PAT' },
  { key: 'trademark', label: 'Trademark', prefix: 'TM' },
  { key: 'copyright', label: 'Copyright', prefix: 'CR' },
  { key: 'design', label: 'Design', prefix: 'DSN' },
];

export function extractMessageSnippet(content, userName) {
  if (!content) return '';
  let body = String(content);
  if (body.startsWith('[') && body.includes(']:')) {
    const closing = body.indexOf(']:');
    body = body.substring(closing + 2);
    if (body.startsWith(' ')) body = body.substring(1);
  }
  const attMarker = '[ATTACHMENTS]:';
  if (body.includes(attMarker)) {
    body = body.substring(0, body.indexOf(attMarker)).trim();
  }
  body = body.replace(/[\r\n]+/g, ' ').trim();
  if (!body) return '';

  if (body.length <= 80) return body;

  if (userName) {
    const cleanUser = String(userName).trim();
    const mentionTarget = `@${cleanUser}`.toLowerCase();
    let idx = body.toLowerCase().indexOf(mentionTarget);
    let targetLength = mentionTarget.length;

    // If full name mention is not found and user name has spaces, check for first name
    if (idx === -1 && cleanUser.includes(' ')) {
      const firstName = cleanUser.split(/\s+/)[0];
      const firstTarget = `@${firstName}`.toLowerCase();
      idx = body.toLowerCase().indexOf(firstTarget);
      if (idx !== -1) {
        targetLength = firstTarget.length;
      }
    }

    if (idx !== -1) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(body.length, idx + targetLength + 50);
      let snippet = body.substring(start, end).trim();
      if (start > 0) snippet = '...' + snippet;
      if (end < body.length) snippet = snippet + '...';
      return snippet;
    }
  }
  return body.slice(0, 77) + '...';
}

export function getBoardKey(boardName) {
  if (!boardName) return 'litigation';
  const norm = String(boardName).toLowerCase().trim();
  const match = BOARDS.find(b => 
    b.key.toLowerCase() === norm || 
    b.label.toLowerCase() === norm ||
    (b.prefix && b.prefix.toLowerCase() === norm) ||
    (b.key === 'misc' && (norm === 'misc' || norm === 'miscellaneous'))
  );
  return match ? match.key : 'litigation';
}

