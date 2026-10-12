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

  // Extract [DEADLINE]:...
  let deadline = ticket.deadline || '';
  const deadlineMarker = '[DEADLINE]:';
  if (cleanText.includes(deadlineMarker)) {
    const dStart = cleanText.indexOf(deadlineMarker) + deadlineMarker.length;
    const dEnd = cleanText.indexOf('\n', dStart);
    deadline = dEnd === -1 ? cleanText.substring(dStart).trim() : cleanText.substring(dStart, dEnd).trim();
    cleanText = (cleanText.substring(0, cleanText.indexOf(deadlineMarker)) + (dEnd === -1 ? '' : cleanText.substring(dEnd))).trim();
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

  return { text: cleanText, attachments, authorName, authorRole, deadline };
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

/**
 * Checks if a user is an executive leader (Pranav Bhat, Sharan, or admin/leader role).
 */
export function isLeaderOrSharan(user) {
  if (!user) return false;
  const name = (typeof user === 'string' ? user : user.name || '').trim().toLowerCase().replace(/\s+/g, '');
  const role = (typeof user === 'object' ? user.role || '' : '').toLowerCase();
  if (role === 'leader' || role === 'admin') return true;
  return name.includes('pranav') || name.includes('sharan');
}

/**
 * Compares two member names with tolerance for whitespace, casing, and partial names.
 */
export function isSameMember(a, b) {
  if (!a || !b) return false;
  const cleanA = String(typeof a === 'object' ? a.name || '' : a).trim().toLowerCase().replace(/\s+/g, '');
  const cleanB = String(typeof b === 'object' ? b.name || '' : b).trim().toLowerCase().replace(/\s+/g, '');
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
}

/**
 * Uploads a file to Zoho WorkDrive via /api/upload.
 * Guarantees all file/photo attachments in the TQ Manager are saved to Zoho WorkDrive instead of Supabase.
 * Returns { url, name, type } on success, or null with error.
 */
export async function uploadFileToZohoWorkDrive(file) {
  if (!file) return null;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.url) {
        return {
          url: data.url,
          name: data.name || file.name,
          type: file.type || 'application/octet-stream'
        };
      }
    }
  } catch (err) {
    console.warn('Zoho WorkDrive upload failed, using local preview fallback:', err);
  }
  return null;
}

const _memoryPinStorage = {};

/**
 * Retrieves up to 3 pinned task IDs for a given team member from storage.
 */
export function getPinnedTaskIds(employeeId) {
  if (!employeeId) return [];
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`lextria_pinned_tasks_${employeeId}`);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return _memoryPinStorage[employeeId] || [];
}

/**
 * Saves up to 3 pinned task IDs for a given member.
 */
export function savePinnedTaskIds(employeeId, ids = []) {
  if (!employeeId) return;
  const sliced = ids.slice(0, 3);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`lextria_pinned_tasks_${employeeId}`, JSON.stringify(sliced));
    }
  } catch {}
  _memoryPinStorage[employeeId] = sliced;
}

/**
 * Toggles a pinned task for a member (max 3 allowed).
 * Returns { pinned: boolean, ids: string[], error?: string }
 */
export function togglePinnedTaskId(employeeId, taskId, maxPins = 3) {
  if (!employeeId || !taskId) return { pinned: false, ids: [] };
  const current = getPinnedTaskIds(employeeId);
  if (current.includes(taskId)) {
    const next = current.filter(id => id !== taskId);
    savePinnedTaskIds(employeeId, next);
    return { pinned: false, ids: next };
  } else {
    if (current.length >= maxPins) {
      return {
        pinned: false,
        ids: current,
        error: `Maximum ${maxPins} tasks can be pinned as top priorities. Please unpin one first.`
      };
    }
    const next = [taskId, ...current].slice(0, maxPins);
    savePinnedTaskIds(employeeId, next);
    return { pinned: true, ids: next };
  }
}

