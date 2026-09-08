import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { 
  Plus, Clock, MessageSquare, X, Send, User, Calendar,
  Download, Eye, Image as ImageIcon, ChevronDown,
  Pencil, Trash2, AlertTriangle, Paperclip, FileText
} from 'lucide-react';

const BOARDS = [
  { key: 'litigation', label: 'Litigation', prefix: 'LIT' },
  { key: 'compliance', label: 'Compliance', prefix: 'CMP' },
  { key: 'misc', label: 'Miscellaneous', prefix: 'MISC' },
  { key: 'patent', label: 'Patent', prefix: 'PAT' },
  { key: 'trademark', label: 'Trademark', prefix: 'TM' },
  { key: 'copyright', label: 'Copyright', prefix: 'CR' },
  { key: 'design', label: 'Design', prefix: 'DSN' },
];

const URGENCIES = ['High', 'Medium', 'Low'];

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
    if (found) authorName = found.name;
  }

  if (cleanText.startsWith('[QUERY]:')) {
    cleanText = cleanText.replace('[QUERY]:', '').trim();
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

export const generateThumbnail = (dataUrl) => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 400;
      const MAX_HEIGHT = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};


export default function QueryTickets({ session, agents = [] }) {
  const [selectedBoardKey, setSelectedBoardKey] = useState('litigation');
  const [activeView, setActiveView] = useState('board'); // 'board' | 'history'
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentsList, setAgentsList] = useState(agents);
  const [membersList, setMembersList] = useState([]);
  const [mentionedTicketIds, setMentionedTicketIds] = useState(new Set());

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageAttachments, setMessageAttachments] = useState([]);
  const messageFileInputRef = useRef(null);

  // Mention state
  const [mentionState, setMentionState] = useState({
    active: false,
    query: '',
    startIndex: -1,
  });

  // New ticket form
  const [urgency, setUrgency] = useState('Medium');
  const [queryText, setQueryText] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Edit ticket state
  const [editingTicket, setEditingTicket] = useState(null);
  const [editUrgency, setEditUrgency] = useState('Medium');
  const [editQueryText, setEditQueryText] = useState('');
  const [editImages, setEditImages] = useState([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editFileInputRef = useRef(null);

  // Delete ticket state
  const [ticketToDelete, setTicketToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentBoard = BOARDS.find(b => b.key === selectedBoardKey) || BOARDS[0];

  const fetchMentions = async () => {
    if (!session?.name) return;
    // Basic ilike query to find messages where content includes @UserName
    const { data, error } = await supabase
      .from('messages')
      .select('ticket_id')
      .ilike('content', `%@${session.name}%`);
    if (!error && data) {
      setMentionedTicketIds(new Set(data.map(d => d.ticket_id)));
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchMentions();
    
    supabase.from('agents').select('id, name').then(({ data }) => {
      if (data && data.length > 0) {
        setAgentsList(data);
      }
    });

    supabase.from('members').select('id, name').then(({ data }) => {
      if (data && data.length > 0) {
        setMembersList(data);
      }
    });
  }, [session?.name]);

  // Close lightbox on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && previewImage) {
        setPreviewImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  const resolveAgentId = (userName) => {
    if (!userName) return null;
    const clean = userName.replace(/\s+/g, '').toLowerCase();
    const list = agentsList.length > 0 ? agentsList : agents;
    const found = list.find(a => a.name?.replace(/\s+/g, '').toLowerCase() === clean);
    return found ? found.id : null;
  };

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tickets:', error);
    } else {
      setTickets(data || []);
    }
    setLoading(false);
  };

  const fetchMessages = async (ticketId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(data || []);
    }
  };

  const uploadAttachmentsAndUpdateTicket = async (recordId, attachmentsList, recordData, table) => {
    try {
      const updatedAttachments = await Promise.all(attachmentsList.map(async (att) => {
        if (att.uploading && att.file) {
          const formData = new FormData();
          formData.append('file', att.file);
          try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (res.ok) {
              const data = await res.json();
              if (data.url) {
                return {
                  name: att.name,
                  type: att.type,
                  preview: att.preview,
                  url: data.url
                };
              }
            }
          } catch (e) {
            console.error("Upload fail for", att.name, e);
          }
        }
        const { file, uploading, ...rest } = att;
        return rest;
      }));

      if (table === 'tickets') {
        const { text, authorName, authorRole } = parseTicketData(recordData, agentsList);
        let newPayload = `[AUTHOR]:${JSON.stringify({name: authorName, role: authorRole})}\n\n[QUERY]:\n${text}`;
        if (updatedAttachments.length > 0) {
          newPayload += `\n\n[ATTACHMENTS]:${JSON.stringify(updatedAttachments)}`;
        }
        
        const { data, error } = await supabase.from('tickets').update({ query: newPayload }).eq('id', recordId).select();
        
        if (!error && data && data.length > 0) {
          const updatedTicket = data[0];
          setTickets(prev => prev.map(t => t.id === recordId ? { ...t, query: updatedTicket.query } : t));
          if (selectedTicket?.id === recordId) {
            setSelectedTicket(prev => ({ ...prev, query: updatedTicket.query }));
          }
        }
      } else if (table === 'messages') {
        let body = recordData.content;
        const attMarker = '\n[ATTACHMENTS]:';
        if (body && body.includes(attMarker)) {
          body = body.substring(0, body.indexOf(attMarker));
        }
        if (updatedAttachments.length > 0) {
          body += `\n[ATTACHMENTS]: ${JSON.stringify(updatedAttachments)}`;
        }
        await supabase.from('messages').update({ content: body }).eq('id', recordId);
        fetchMessages(recordData.ticket_id);
      }
    } catch (err) {
      console.error('Background upload failed', err);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!queryText.trim()) return;
    setSubmitting(true);

    const agentId = resolveAgentId(session?.name);
    const authorMeta = {
      name: session?.name || 'Member',
      role: session?.role || 'member'
    };

    let processedImages = [];
    for (const img of images) {
      if (img.file) {
        const thumb = await generateThumbnail(img.preview);
        processedImages.push({
          name: img.name,
          type: img.file.type,
          preview: thumb,
          file: img.file,
          uploading: true
        });
      } else {
        processedImages.push(img);
      }
    }

    let fullPayloadText = `[AUTHOR]:${JSON.stringify(authorMeta)}\n\n[QUERY]:\n${queryText.trim()}`;
    if (processedImages.length > 0) {
      const toSave = processedImages.map(a => {
        const { file, uploading, ...rest } = a;
        return rest;
      });
      fullPayloadText += `\n\n[ATTACHMENTS]:${JSON.stringify(toSave)}`;
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert([{
        board: currentBoard.label,
        urgency: urgency,
        query: fullPayloadText,
        created_by: agentId,
        status: 'Open'
      }])
      .select();

    setSubmitting(false);

    if (error) {
      console.error('Error creating ticket:', error);
      alert('Could not create ticket: ' + (error.message || 'Please check Supabase connection.'));
    } else {
      setShowNewModal(false);
      setQueryText('');
      setUrgency('Medium');
      setImages([]);
      const ticketData = data[0];
      setTickets(prev => [ticketData, ...prev]);
      
      const filesToUpload = processedImages.filter(a => a.uploading);
      if (filesToUpload.length > 0) {
        uploadAttachmentsAndUpdateTicket(ticketData.id, processedImages, ticketData, 'tickets');
      }
    }
  };

  const updateTicketStatus = async (ticketId, newStatus) => {
    // Optimistic UI update
    const previousTickets = [...tickets];
    const previousSelected = selectedTicket ? { ...selectedTicket } : null;

    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket(prev => ({ ...prev, status: newStatus }));
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ status: newStatus })
      .eq('id', ticketId)
      .select();

    if (error || !data || data.length === 0) {
      console.error('Error updating status:', error || 'No data returned (possibly due to RLS).');
      // Rollback
      setTickets(previousTickets);
      setSelectedTicket(previousSelected);
    }
  };

  const handleMessageChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const words = textBeforeCursor.split(/\s/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('@')) {
      const query = lastWord.slice(1).toLowerCase();
      setMentionState({
        active: true,
        query: query,
        startIndex: cursorPosition - lastWord.length
      });
    } else {
      setMentionState({ active: false, query: '', startIndex: -1 });
    }
  };

  const handleMentionSelect = (agentName) => {
    const beforeMention = newMessage.slice(0, mentionState.startIndex);
    const afterMention = newMessage.slice(mentionState.startIndex + mentionState.query.length + 1);
    setNewMessage(beforeMention + '@' + agentName + ' ' + afterMention);
    setMentionState({ active: false, query: '', startIndex: -1 });
  };


  const handleMessageAttachmentUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMessageAttachments(prev => [...prev, { name: file.name, file: file, type: file.type, preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMessageAttachment = (index) => {
    setMessageAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleMessageKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && messageAttachments.length === 0) || !selectedTicket) return;

    const agentId = resolveAgentId(session?.name);
    const authorName = session?.name || 'Member';
    let contentWithAuthor = `[${authorName}]: ${newMessage.trim()}`;

    let processedAttachments = [];
    for (const att of messageAttachments) {
      if (att.file) {
        const thumb = await generateThumbnail(att.preview);
        processedAttachments.push({
          name: att.name,
          type: att.file.type,
          preview: thumb,
          file: att.file,
          uploading: true
        });
      } else {
        processedAttachments.push(att);
      }
    }

    if (processedAttachments.length > 0) {
      const toSave = processedAttachments.map(a => {
        const { file, uploading, ...rest } = a;
        return rest;
      });
      contentWithAuthor += `\n[ATTACHMENTS]: ${JSON.stringify(toSave)}`;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        ticket_id: selectedTicket.id,
        content: contentWithAuthor,
        agent_id: agentId
      }])
      .select();

    if (error) {
      console.error('Error sending message:', error);
      alert('Error sending message: ' + (error.message || 'Please check connection.'));
    } else {
      setNewMessage('');
      setMessageAttachments([]);
      setMentionState({ active: false, query: '', startIndex: -1 });
      fetchMessages(selectedTicket.id);
      fetchMentions();

      const msgData = data[0];
      const filesToUpload = processedAttachments.filter(a => a.uploading);
      if (filesToUpload.length > 0) {
        uploadAttachmentsAndUpdateTicket(msgData.id, processedAttachments, msgData, 'messages');
      }
    }
  };

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    fetchMessages(ticket.id);
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages(prev => [...prev, { name: file.name, file: file, preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // --- Edit Ticket Handlers ---
  const startEditTicket = (ticket, e) => {
    if (e) e.stopPropagation();
    const { text, attachments } = parseTicketData(ticket, agentsList);
    setEditingTicket(ticket);
    setEditUrgency(ticket.urgency || 'Medium');
    setEditQueryText(text);
    setEditImages(attachments || []);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editQueryText.trim() || !editingTicket) return;
    setEditSubmitting(true);

    const { authorName, authorRole } = parseTicketData(editingTicket, agentsList);
    const authorMeta = { name: authorName, role: authorRole };

    let processedImages = [];
    for (const img of editImages) {
      if (img.file) {
        const thumb = await generateThumbnail(img.preview);
        processedImages.push({
          name: img.name,
          type: img.file.type,
          preview: thumb,
          file: img.file,
          uploading: true
        });
      } else {
        processedImages.push(img);
      }
    }

    let fullPayloadText = `[AUTHOR]:${JSON.stringify(authorMeta)}\n\n[QUERY]:\n${editQueryText.trim()}`;
    if (processedImages.length > 0) {
      const toSave = processedImages.map(a => {
        const { file, uploading, ...rest } = a;
        return rest;
      });
      fullPayloadText += `\n\n[ATTACHMENTS]:${JSON.stringify(toSave)}`;
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({
        urgency: editUrgency,
        query: fullPayloadText
      })
      .eq('id', editingTicket.id)
      .select();

    setEditSubmitting(false);

    if (error) {
      console.error('Error updating ticket:', error);
      alert('Could not update ticket: ' + error.message);
    } else if (data && data[0]) {
      const updated = data[0];
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      if (selectedTicket?.id === updated.id) {
        setSelectedTicket(updated);
      }
      setEditingTicket(null);
      
      const filesToUpload = processedImages.filter(a => a.uploading);
      if (filesToUpload.length > 0) {
        uploadAttachmentsAndUpdateTicket(updated.id, processedImages, updated, 'tickets');
      }
    }
  };

  const handleEditImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setEditImages(prev => [...prev, { name: file.name, file: file, preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeEditImage = (index) => {
    setEditImages(prev => prev.filter((_, i) => i !== index));
  };

  // --- Delete Ticket Handlers ---
  const promptDeleteTicket = (ticket, e) => {
    if (e) e.stopPropagation();
    setTicketToDelete(ticket);
  };

  const confirmDeleteTicket = async () => {
    if (!ticketToDelete) return;
    setIsDeleting(true);

    const ticketId = ticketToDelete.id;
    const previousTickets = [...tickets];
    const previousSelected = selectedTicket ? { ...selectedTicket } : null;

    // Optimistic update
    setTickets(prev => prev.filter(t => t.id !== ticketId));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(null);
    }
    setTicketToDelete(null);

    // Delete associated messages first
    await supabase.from('messages').delete().eq('ticket_id', ticketId);

    // Delete ticket
    const { data, error } = await supabase.from('tickets').delete().eq('id', ticketId).select();

    setIsDeleting(false);

    if (error || !data || data.length === 0) {
      console.error('Error deleting ticket:', error || 'Delete failed silently (possibly due to RLS).');
      alert('Could not delete ticket. You may not have permission.');
      // Rollback
      setTickets(previousTickets);
      setSelectedTicket(previousSelected);
    }
  };

  // Filter tickets by selected board
  const boardTickets = tickets.filter(t => {
    if (!t.board) return false;
    const b = t.board.toLowerCase();
    const curr = currentBoard.label.toLowerCase();
    const key = currentBoard.key.toLowerCase();
    return b === curr || b === key || (key === 'misc' && (b === 'misc' || b === 'miscellaneous'));
  });

  // Auto sort by urgency: High > Medium > Low, then newest first
  const urgencyWeight = { 'high': 0, 'medium': 1, 'low': 2 };
  const sortTickets = (ticketList) => {
    return [...ticketList].sort((a, b) => {
      const uA = urgencyWeight[(a.urgency || '').toLowerCase()] ?? 1;
      const uB = urgencyWeight[(b.urgency || '').toLowerCase()] ?? 1;
      if (uA !== uB) return uA - uB;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  };

  const openTickets = sortTickets(boardTickets.filter(t => (t.status || '').toLowerCase() === 'open'));
  const discussingTickets = sortTickets(boardTickets.filter(t => (t.status || '').toLowerCase() === 'in discussion' || (t.status || '').toLowerCase() === 'discussing'));
  const resolvedTickets = sortTickets(boardTickets.filter(t => (t.status || '').toLowerCase() === 'resolved'));

  const urgencyBadge = (u) => {
    if (u === 'High') return 'bg-red-100 text-red-700 border-red-200';
    if (u === 'Medium') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  };

  const getBoardCounts = (boardKey, boardLabel) => {
    const matchingTickets = tickets.filter(t => {
      if (!t.board) return false;
      const b = t.board.toLowerCase();
      const curr = boardLabel.toLowerCase();
      const key = boardKey.toLowerCase();
      return b === curr || b === key || (key === 'misc' && (b === 'misc' || b === 'miscellaneous'));
    });

    const unresolved = matchingTickets.filter(t => (t.status || '').toLowerCase() !== 'resolved').length;
    const openCount = matchingTickets.filter(t => (t.status || '').toLowerCase() === 'open').length;
    const hasMention = matchingTickets.some(t => mentionedTicketIds.has(t.id));

    return { unresolved, openCount, hasMention };
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f4f5f7] text-slate-800">
      {/* Board Category Pills */}
      <div className="px-6 pt-5 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          {BOARDS.map(b => {
            const c = getBoardCounts(b.key, b.label);
            const isSelected = selectedBoardKey === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setSelectedBoardKey(b.key)}
                className={`relative inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#16234f] text-white border-[#16234f] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{b.label}</span>
                {c.unresolved > 0 && (
                  <span className="inline-flex items-center gap-1 ml-0.5">
                    {/* Gray badge: Total active / unresolved tickets */}
                    <span 
                      title={`${c.unresolved} active tickets`}
                      className="inline-flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-slate-400 text-white text-[10px] font-bold"
                    >
                      {c.unresolved}
                    </span>
                    {/* Red badge: Open tickets needing attention */}
                    {c.openCount > 0 && (
                      <span 
                        title={`${c.openCount} open tickets`}
                        className="inline-flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold"
                      >
                        {c.openCount}
                      </span>
                    )}
                  </span>
                )}
                {c.hasMention && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs ml-1 shadow-sm font-bold">
                    @
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Board / History Tabs + New Query Button */}
      <div className="px-6 pt-3 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView('board')}
            className={`px-3.5 py-1.5 text-sm font-semibold rounded transition-colors ${
              activeView === 'board'
                ? 'text-slate-900 bg-white shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setActiveView('history')}
            className={`px-3.5 py-1.5 text-sm font-semibold rounded transition-colors ${
              activeView === 'history'
                ? 'text-slate-900 bg-white shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            History
          </button>
        </div>

        <button 
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 bg-[#16234f] hover:bg-[#1f3169] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus size={16} /> New query
        </button>
      </div>

      {/* Main Kanban Content */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#16234f]"></div>
          </div>
        ) : activeView === 'board' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Open Column */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 flex justify-between items-center border-b border-slate-100">
                <h2 className="font-semibold text-slate-900 text-[15px]">Open</h2>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5">{openTickets.length}</span>
              </div>
              <div className="p-4 space-y-3 min-h-[120px] max-h-[calc(100vh-230px)] overflow-y-auto pr-1.5 custom-scrollbar flex-1">
                {openTickets.length === 0 ? (
                  <p className="text-slate-400 text-sm italic">Nothing here.</p>
                ) : (
                  openTickets.map(ticket => (
                    <TicketCardItem 
                      key={ticket.id} 
                      ticket={ticket} 
                      onClick={() => openTicket(ticket)} 
                      urgencyBadge={urgencyBadge} 
                      agentsList={agentsList} 
                      onOpenImage={(img) => setPreviewImage(img)}
                      onEdit={(t) => startEditTicket(t)}
                      onDelete={(t) => promptDeleteTicket(t)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* In Discussion Column */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 flex justify-between items-center border-b border-slate-100">
                <h2 className="font-semibold text-slate-900 text-[15px]">In Discussion</h2>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5">{discussingTickets.length}</span>
              </div>
              <div className="p-4 space-y-3 min-h-[120px] max-h-[calc(100vh-230px)] overflow-y-auto pr-1.5 custom-scrollbar flex-1">
                {discussingTickets.length === 0 ? (
                  <p className="text-slate-400 text-sm italic">Nothing here.</p>
                ) : (
                  discussingTickets.map(ticket => (
                    <TicketCardItem 
                      key={ticket.id} 
                      ticket={ticket} 
                      onClick={() => openTicket(ticket)} 
                      urgencyBadge={urgencyBadge} 
                      agentsList={agentsList} 
                      onOpenImage={(img) => setPreviewImage(img)} 
                      onEdit={(t) => startEditTicket(t)}
                      onDelete={(t) => promptDeleteTicket(t)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* History View */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 flex justify-between items-center border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-[15px]">Resolved</h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5">{resolvedTickets.length}</span>
            </div>
            <div className="p-4 min-h-[120px] max-h-[calc(100vh-230px)] overflow-y-auto pr-1.5 custom-scrollbar">
              {resolvedTickets.length === 0 ? (
                <p className="text-slate-400 text-sm italic">Nothing here.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {resolvedTickets.map(ticket => (
                    <TicketCardItem 
                      key={ticket.id} 
                      ticket={ticket} 
                      onClick={() => openTicket(ticket)} 
                      urgencyBadge={urgencyBadge} 
                      agentsList={agentsList} 
                      onOpenImage={(img) => setPreviewImage(img)} 
                      onEdit={(t) => startEditTicket(t)}
                      onDelete={(t) => promptDeleteTicket(t)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Query Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl relative animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between px-6 pt-6 pb-2 border-b border-slate-100">
              <h2 className="text-lg font-bold text-[#16234f]">
                New query · {currentBoard.label}
              </h2>
              <button 
                onClick={() => { setShowNewModal(false); setImages([]); }} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-6">
              <p className="mb-4 text-sm text-slate-500">
                Raising as <span className="font-semibold text-slate-800">{session?.name || 'Leader'}</span>
              </p>

              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Urgency</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 font-medium px-3 py-2 text-sm outline-none focus:border-[#16234f]"
                >
                  {URGENCIES.map((u) => (
                    <option key={u} value={u} className="text-slate-900 bg-white">{u}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Query</label>
                <textarea
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  required
                  rows={5}
                  placeholder="Describe what you need from the leader… (links are auto-detected)"
                  className="w-full resize-y rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 text-sm outline-none focus:border-[#16234f]"
                />
              </div>

              <div className="mb-6">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Attach images (optional)</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg border border-slate-200 overflow-hidden group">
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#16234f] flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-[#16234f] transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-[10px] font-medium">Image</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowNewModal(false); setImages([]); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#16234f] hover:bg-[#1f3169] px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                >
                  {submitting ? 'Raising…' : 'Raise ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Details & Chat Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[80vh] flex flex-col md:flex-row rounded-2xl shadow-2xl relative overflow-hidden">
            <button 
              onClick={() => setSelectedTicket(null)} 
              className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            {/* Left side: Ticket Details */}
            <div className="w-full md:w-[380px] bg-slate-50 border-r border-slate-200 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              {(() => {
                const { text, attachments, authorName, authorRole } = parseTicketData(selectedTicket, agentsList);
                return (
                  <>
                    {/* Top Author Header matching the screenshot */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <span className="font-bold text-[#d32f2f] text-xl tracking-tight block">
                          {authorName} {authorRole ? (authorRole.charAt(0).toUpperCase() + authorRole.slice(1)) : ''}
                        </span>
                        <span className="text-xs text-slate-400">
                          {selectedTicket.board} · {new Date(selectedTicket.created_at).toLocaleDateString()} at {new Date(selectedTicket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 border rounded-full shrink-0 ${urgencyBadge(selectedTicket.urgency)}`}>
                          {selectedTicket.urgency}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => startEditTicket(selectedTicket, e)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition cursor-pointer"
                          title="Edit ticket"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => promptDeleteTicket(selectedTicket, e)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-red-600 transition cursor-pointer"
                          title="Delete ticket"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Attached Images preview right below author name */}
                    {attachments.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {attachments.map((att, idx) => {
                          const hasUrl = !!att.url;
                          const isLegacyExternal = att.preview && att.preview.startsWith('http');
                          
                          if (hasUrl || isLegacyExternal) {
                            const linkHref = att.url || att.preview;
                            const hasThumbnail = att.preview && !att.preview.startsWith('http');
                            return (
                              <a 
                                key={idx}
                                href={linkHref} 
                                target="_blank" 
                                rel="noreferrer"
                                className="block rounded-xl border border-slate-200 bg-slate-50 overflow-hidden hover:border-slate-300 transition-colors"
                              >
                                {hasThumbnail ? (
                                  <img 
                                    src={att.preview} 
                                    alt={att.name || 'Attachment'} 
                                    className="w-full max-h-64 object-cover object-top hover:scale-[1.01] transition-transform duration-150" 
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 p-3 text-blue-600 font-medium hover:bg-slate-100 transition-colors">
                                    <FileText size={20} />
                                    View {att.name || 'Attachment'}
                                  </div>
                                )}
                              </a>
                            );
                          } else {
                            return (
                              <div 
                                key={idx}
                                onClick={() => setPreviewImage(att)}
                                className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group cursor-pointer shadow-xs"
                              >
                                <img 
                                  src={att.preview} 
                                  alt={att.name || 'Attachment'} 
                                  className="w-full max-h-64 object-cover object-top group-hover:scale-[1.01] transition-transform duration-150" 
                                />
                                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-2xs">
                                  <Eye size={16} /> Click to expand
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    )}

                    {/* Ticket Code (e.g. Q.85) */}
                    <div className="font-bold text-slate-900 text-xl mb-2 tracking-tight">
                      {selectedTicket.code || 'Q.1'}
                    </div>

                    {/* Query Content */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-xs">
                      <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{text}</p>
                    </div>
                  </>
                );
              })()}

              <div className="mt-auto pt-4">
                <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Update Status</p>
                <div className="flex flex-col gap-2">
                  {selectedTicket.status !== 'Open' && (
                    <button 
                      onClick={() => updateTicketStatus(selectedTicket.id, 'Open')} 
                      className="w-full py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      Move to Open
                    </button>
                  )}
                  {selectedTicket.status !== 'In Discussion' && (
                    <button 
                      onClick={() => updateTicketStatus(selectedTicket.id, 'In Discussion')} 
                      className="w-full py-2 text-sm rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors cursor-pointer"
                    >
                      Move to Discussion
                    </button>
                  )}
                  {selectedTicket.status !== 'Resolved' && (
                    <button 
                      onClick={() => updateTicketStatus(selectedTicket.id, 'Resolved')} 
                      className="w-full py-2 text-sm rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium transition-colors cursor-pointer"
                    >
                      Mark as Resolved
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right side: Messages Thread */}
            <div className="flex-1 flex flex-col h-full">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-white">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <MessageSquare size={16} className="text-[#16234f]"/> Discussion Thread
                </h3>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  selectedTicket.status === 'Open' ? 'bg-amber-100 text-amber-700' :
                  selectedTicket.status === 'In Discussion' ? 'bg-blue-100 text-blue-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {selectedTicket.status}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 custom-scrollbar">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <MessageSquare size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    let author = 'Member';
                    let body = msg.content;
                    if (body && body.startsWith('[') && body.includes(']: ')) {
                      const closing = body.indexOf(']: ');
                      author = body.substring(1, closing);
                      body = body.substring(closing + 3);
                    } else if (msg.agent_id) {
                      const found = agentsList.find(a => a.id === msg.agent_id);
                      if (found) author = found.name;
                    }

                    let attachments = [];
                    const attMarker = '\n[ATTACHMENTS]:';
                    if (body && body.includes(attMarker)) {
                      const idx = body.indexOf(attMarker);
                      const jsonStr = body.substring(idx + attMarker.length).trim();
                      body = body.substring(0, idx);
                      try {
                        const parsed = JSON.parse(jsonStr);
                        if (Array.isArray(parsed)) attachments = parsed;
                      } catch {}
                    }

                    const isOwn = (session?.name && author.toLowerCase() === session.name.toLowerCase()) ||
                                  (session?.name && session.name.replace(/\s+/g,'').toLowerCase() === author.replace(/\s+/g,'').toLowerCase());

                    return (
                      <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                        <span className="text-[11px] font-semibold text-slate-500 mb-0.5 px-1">
                          {author} {isOwn && '(You)'}
                        </span>
                        <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] text-sm ${
                          isOwn 
                            ? 'bg-[#16234f] text-white rounded-br-sm' 
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-sm'
                        }`}>
                          {body && <div className="whitespace-pre-line break-words">{body}</div>}
                          {attachments.length > 0 && (
                            <div className={`flex flex-wrap gap-2 ${body ? 'mt-2 pt-2 border-t border-white/20' : ''}`}>
                              {attachments.map((att, idx) => {
                                const hasUrl = !!att.url;
                                const isLegacyExternal = att.preview && att.preview.startsWith('http');
                                const isImage = att.type && att.type.startsWith('image/');
                                
                                return (
                                <div key={idx} className="relative group">
                                  {(hasUrl || isLegacyExternal) ? (
                                    <a 
                                      href={att.url || att.preview} 
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block"
                                      title={`View ${att.name}`}
                                    >
                                      {att.preview && !att.preview.startsWith('http') ? (
                                        <img 
                                          src={att.preview} 
                                          alt={att.name} 
                                          className="h-16 w-16 object-cover rounded hover:opacity-90 border border-white/20"
                                        />
                                      ) : (
                                        <div className={`flex items-center gap-1.5 p-1.5 rounded border transition-colors ${
                                          isOwn ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-blue-600'
                                        }`}>
                                          <FileText size={16} />
                                          <span className="text-xs truncate max-w-[100px] font-medium">{att.name}</span>
                                        </div>
                                      )}
                                    </a>
                                  ) : isImage ? (
                                    <img 
                                      src={att.preview} 
                                      alt={att.name} 
                                      className="h-16 w-16 object-cover rounded cursor-pointer hover:opacity-90"
                                      onClick={() => setPreviewImage(att.preview)}
                                    />
                                  ) : (
                                    <a 
                                      href={att.preview} 
                                      target="_blank"
                                      rel="noreferrer"
                                      download={att.name}
                                      className={`flex items-center gap-1.5 p-1.5 rounded border transition-colors ${
                                        isOwn ? 'bg-white/10 hover:bg-white/20 border-white/20' : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
                                      }`}
                                      title={`View ${att.name}`}
                                    >
                                      <FileText size={16} />
                                      <span className="text-xs truncate max-w-[100px] font-medium">{att.name}</span>
                                    </a>
                                  )}
                                </div>
                              )})}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Input */}
              {selectedTicket.status !== 'Resolved' ? (
                <div className="relative p-4 border-t border-slate-200 bg-white flex flex-col gap-2">
                  {/* Mention Dropdown */}
                  {mentionState.active && (
                    <div className="absolute bottom-[calc(100%-10px)] left-4 bg-white border border-slate-200 rounded-lg shadow-lg w-64 max-h-48 overflow-y-auto z-50">
                      {membersList.filter(a => a.name.toLowerCase().includes(mentionState.query)).length > 0 ? (
                        membersList.filter(a => a.name.toLowerCase().includes(mentionState.query)).map(member => (
                          <div
                            key={member.id}
                            className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer text-slate-800"
                            onClick={() => handleMentionSelect(member.name)}
                          >
                            {member.name}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">No users found</div>
                      )}
                    </div>
                  )}

                  {/* Attachment Previews */}
                  {messageAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1">
                      {messageAttachments.map((att, idx) => (
                        <div key={idx} className="relative group flex items-center gap-2 bg-slate-100 p-2 rounded border border-slate-200">
                          {att.type && att.type.startsWith('image/') ? (
                            <img src={att.preview} alt={att.name} className="h-10 w-10 object-cover rounded" />
                          ) : (
                            <FileText size={24} className="text-slate-500" />
                          )}
                          <span className="text-xs text-slate-700 max-w-[150px] truncate" title={att.name}>{att.name}</span>
                          <button
                            type="button"
                            onClick={() => removeMessageAttachment(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => messageFileInputRef.current?.click()}
                      className="p-2 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mb-1 cursor-pointer"
                      title="Attach file"
                    >
                      <Paperclip size={20} />
                    </button>
                    <input 
                      type="file" 
                      multiple 
                      className="hidden" 
                      ref={messageFileInputRef} 
                      onChange={handleMessageAttachmentUpload} 
                    />
                    
                    <textarea 
                      value={newMessage}
                      onChange={handleMessageChange}
                      onKeyUp={e => handleMessageChange(e)}
                      onClick={e => handleMessageChange(e)}
                      onKeyDown={handleMessageKeyDown}
                      placeholder="Type your reply... (Shift+Enter for new line)"
                      className="flex-1 border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 rounded-lg px-3 py-2 text-sm focus:border-[#16234f] outline-none min-h-[44px] max-h-32 resize-y custom-scrollbar"
                      rows={1}
                    />
                    
                    <button 
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() && messageAttachments.length === 0}
                      className="bg-[#16234f] hover:bg-[#1f3169] disabled:opacity-40 text-white p-2.5 rounded-lg transition-colors flex-shrink-0 mb-0.5 cursor-pointer"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-slate-200 bg-slate-50 text-center text-sm text-slate-500">
                  This query is resolved. Reopen to continue discussion.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[92vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between py-2.5 px-4 bg-slate-900/90 rounded-t-xl text-white">
              <span className="text-xs sm:text-sm font-medium truncate max-w-md">
                📷 {previewImage.name || 'Image Attachment'}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.preview}
                  download={previewImage.name || 'attachment.png'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition cursor-pointer"
                >
                  <Download size={14} /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Image display */}
            <div className="bg-black/60 w-full flex items-center justify-center p-3 rounded-b-xl overflow-auto max-h-[82vh]">
              <img
                src={previewImage.preview}
                alt={previewImage.name || 'Screenshot'}
                className="max-h-[78vh] max-w-full object-contain rounded shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
      {/* Edit Ticket Modal */}
      {editingTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-[#16234f] flex items-center gap-2">
                <Pencil size={18} /> Edit Query Ticket · {editingTicket.code || 'Ticket'}
              </h2>
              <button 
                onClick={() => setEditingTicket(null)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {/* Urgency selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Urgency Level
                </label>
                <select
                  value={editUrgency}
                  onChange={(e) => setEditUrgency(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#16234f] bg-white font-medium"
                >
                  <option value="High">High Urgency</option>
                  <option value="Medium">Medium Urgency</option>
                  <option value="Low">Low Urgency</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Query Description
                </label>
                <textarea
                  required
                  rows={4}
                  value={editQueryText}
                  onChange={(e) => setEditQueryText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#16234f] placeholder-slate-400 custom-scrollbar"
                  placeholder="Describe your query..."
                />
              </div>

              {/* Attached images management */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Attached Screenshots
                  </label>
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    <Plus size={13} /> Add Screenshot
                  </button>
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleEditImageUpload}
                  />
                </div>

                {editImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2.5 mt-2">
                    {editImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50 h-20">
                        <img src={img.preview} alt={img.name || 'Attachment'} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeEditImage(idx)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-90 hover:opacity-100 transition cursor-pointer"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No images attached.</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTicket(null)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-[#16234f] text-white hover:bg-[#16234f]/90 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Popup */}
      {ticketToDelete && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Query Ticket?</h3>
                <p className="text-xs font-mono text-slate-500 font-semibold mt-0.5">
                  {ticketToDelete.code || 'Query Ticket'} · {ticketToDelete.board}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete this query ticket? All discussion replies and attachments will be permanently removed. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTicketToDelete(null)}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteTicket}
                className="px-5 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketCardItem({ ticket, onClick, urgencyBadge, agentsList = [], onOpenImage, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const { text, attachments, authorName, authorRole } = parseTicketData(ticket, agentsList);

  const isLong = text && (text.length > 180 || text.split('\n').length > 3);
  const displayText = (!expanded && isLong) ? (text.slice(0, 180) + '...') : text;

  const displayCode = ticket.code || 'Q.1';
  const formattedTime = new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  const roleDisplay = authorRole ? (authorRole.charAt(0).toUpperCase() + authorRole.slice(1)) : '';
  const authorFullHeader = `${authorName} ${roleDisplay}`.trim();

  return (
    <div 
      onClick={onClick}
      className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between group"
    >
      <div>
        {/* Top Header: Author Name and Role in bold Red (#d32f2f) with action buttons and chevron */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-bold text-[#d32f2f] text-[16px] tracking-tight truncate" title={authorFullHeader}>
            {authorFullHeader}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 border rounded-full ${urgencyBadge(ticket.urgency)}`}>
              {ticket.urgency}
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(ticket);
                }}
                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                title="Edit query"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(ticket);
                }}
                className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                title="Delete query"
              >
                <Trash2 size={13} />
              </button>
            )}
            <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition ml-0.5">
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        {/* Attached Screenshot preview if available - prominent right below name */}
        {attachments.length > 0 && (
          <div className="mb-3 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 relative">
            {attachments[0].url || (attachments[0].preview && attachments[0].preview.startsWith('http')) ? (
              <a 
                href={attachments[0].url || attachments[0].preview} 
                target="_blank" 
                rel="noreferrer" 
                className="block w-full"
                onClick={(e) => e.stopPropagation()}
              >
                {attachments[0].preview && !attachments[0].preview.startsWith('http') ? (
                  <img 
                    src={attachments[0].preview} 
                    alt={attachments[0].name || 'Attached Screenshot'} 
                    className="w-full max-h-56 object-cover object-top hover:scale-[1.01] transition-transform duration-150"
                  />
                ) : (
                  <div className="flex items-center justify-center gap-2 w-full py-4 text-blue-600 hover:bg-blue-50 font-medium transition-colors">
                    <FileText size={20} />
                    View {attachments[0].name || 'Attachment'}
                  </div>
                )}
              </a>
            ) : (
              <img 
                src={attachments[0].preview} 
                alt={attachments[0].name || 'Attached Screenshot'} 
                className="w-full max-h-56 object-cover object-top hover:scale-[1.01] transition-transform duration-150"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenImage) onOpenImage(attachments[0]);
                }}
              />
            )}
            {attachments.length > 1 && (
              <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs">
                +{attachments.length - 1} more
              </span>
            )}
          </div>
        )}

        {/* Ticket Code (e.g. Q.85) */}
        <div className="font-bold text-slate-900 text-lg mb-1.5 tracking-tight">
          {displayCode}
        </div>

        {/* Description */}
        <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed font-normal">
          {displayText}
        </p>
      </div>

      {/* Bottom row: Read more on left (green), timestamp on right */}
      <div className="flex items-center justify-between text-xs pt-2.5 mt-2 border-t border-slate-100">
        <div>
          {isLong ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-[#128c7e] hover:text-[#075e54] font-semibold text-xs transition cursor-pointer"
            >
              {expanded ? 'Read less' : 'Read more'}
            </button>
          ) : (
            <span className="text-slate-400 font-medium text-[11px]">{ticket.board}</span>
          )}
        </div>
        <span className="text-slate-400 font-normal text-xs">
          {formattedTime}
        </span>
      </div>
    </div>
  );
}
