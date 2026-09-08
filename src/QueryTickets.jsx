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

export { parseTicketData, isImageAttachment, getImageSrc } from './attachmentUtils';
import { parseTicketData, isImageAttachment, getImageSrc } from './attachmentUtils';

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
  const [lightboxError, setLightboxError] = useState(false);
  const handleOpenPreview = (img) => {
    setLightboxError(false);
    setPreviewImage(img);
  };
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageAttachments, setMessageAttachments] = useState([]);
  const messageFileInputRef = useRef(null);
  const messageImageInputRef = useRef(null);
  const messageDocInputRef = useRef(null);

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
  const docFileInputRef = useRef(null);

  // Edit ticket state
  const [editingTicket, setEditingTicket] = useState(null);
  const [editUrgency, setEditUrgency] = useState('Medium');
  const [editQueryText, setEditQueryText] = useState('');
  const [editImages, setEditImages] = useState([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editFileInputRef = useRef(null);
  const editDocFileInputRef = useRef(null);

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
                  ...(isImageAttachment(att) ? { preview: att.preview } : {}),
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
          setSelectedTicket(prev => (prev && prev.id === recordId ? { ...prev, query: updatedTicket.query } : prev));
        }
      } else if (table === 'messages') {
        let body = recordData.content;
        const attMarker = '[ATTACHMENTS]:';
        if (body && body.includes(attMarker)) {
          body = body.substring(0, body.indexOf(attMarker)).trim();
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
        if (isImageAttachment(img)) {
          const thumb = await generateThumbnail(img.preview);
          processedImages.push({
            name: img.name,
            type: img.file.type || img.type || 'image/png',
            preview: thumb,
            file: img.file,
            uploading: true
          });
        } else {
          processedImages.push({
            name: img.name,
            type: img.file.type || img.type || 'application/octet-stream',
            preview: '',
            file: img.file,
            uploading: true
          });
        }
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


  const handleMessageImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMessageAttachments(prev => [...prev, { name: file.name, file: file, type: file.type || 'image/png', preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleMessageDocUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const isImg = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
      if (isImg) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setMessageAttachments(prev => [...prev, { name: file.name, file: file, type: file.type || 'image/png', preview: ev.target.result }]);
        };
        reader.readAsDataURL(file);
      } else {
        setMessageAttachments(prev => [...prev, { name: file.name, file: file, type: file.type || 'application/octet-stream', preview: '' }]);
      }
    });
    e.target.value = '';
  };

  const handleMessageAttachmentUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.type && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setMessageAttachments(prev => [...prev, { name: file.name, file: file, type: file.type, preview: ev.target.result }]);
        };
        reader.readAsDataURL(file);
      } else {
        setMessageAttachments(prev => [...prev, { name: file.name, file: file, type: file.type || 'application/octet-stream', preview: '' }]);
      }
    });
    e.target.value = '';
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
        if (isImageAttachment(att)) {
          const thumb = await generateThumbnail(att.preview);
          processedAttachments.push({
            name: att.name,
            type: att.file.type || att.type || 'image/png',
            preview: thumb,
            file: att.file,
            uploading: true
          });
        } else {
          processedAttachments.push({
            name: att.name,
            type: att.file.type || att.type || 'application/octet-stream',
            preview: '',
            file: att.file,
            uploading: true
          });
        }
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
        setImages(prev => [...prev, { name: file.name, file: file, type: file.type || 'image/png', preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDocUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const isImg = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
      if (isImg) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setImages(prev => [...prev, { name: file.name, file: file, type: file.type || 'image/png', preview: ev.target.result }]);
        };
        reader.readAsDataURL(file);
      } else {
        setImages(prev => [...prev, { name: file.name, file: file, type: file.type || 'application/octet-stream', preview: '' }]);
      }
    });
    e.target.value = '';
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
        if (isImageAttachment(img)) {
          const thumb = await generateThumbnail(img.preview);
          processedImages.push({
            name: img.name,
            type: img.file.type || img.type || 'image/png',
            preview: thumb,
            file: img.file,
            uploading: true
          });
        } else {
          processedImages.push({
            name: img.name,
            type: img.file.type || img.type || 'application/octet-stream',
            preview: '',
            file: img.file,
            uploading: true
          });
        }
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
        setEditImages(prev => [...prev, { name: file.name, file: file, type: file.type || 'image/png', preview: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleEditDocUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const isImg = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
      if (isImg) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setEditImages(prev => [...prev, { name: file.name, file: file, type: file.type || 'image/png', preview: ev.target.result }]);
        };
        reader.readAsDataURL(file);
      } else {
        setEditImages(prev => [...prev, { name: file.name, file: file, type: file.type || 'application/octet-stream', preview: '' }]);
      }
    });
    e.target.value = '';
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
                      onOpenImage={handleOpenPreview}
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
                      onOpenImage={handleOpenPreview} 
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
                      onOpenImage={handleOpenPreview} 
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
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Attachments (optional)</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {images.map((img, i) => (
                    isImageAttachment(img) ? (
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
                    ) : (
                      <div key={i} className="relative w-28 h-16 rounded-lg border border-slate-200 bg-slate-50 p-2 flex flex-col justify-between group overflow-hidden">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <FileText size={16} className="text-blue-600 shrink-0" />
                          <span className="text-[11px] font-medium truncate" title={img.name}>{img.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">{img.name ? (img.name.split('.').pop() || 'DOC') : 'DOC'}</span>
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#16234f] flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-[#16234f] transition-colors cursor-pointer"
                    title="Attach image"
                  >
                    <ImageIcon size={16} />
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
                  <button
                    type="button"
                    onClick={() => docFileInputRef.current?.click()}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#16234f] flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-[#16234f] transition-colors cursor-pointer"
                    title="Attach document (PDF, PPT, Word, Excel, etc.)"
                  >
                    <FileText size={16} />
                    <span className="text-[10px] font-medium">Document</span>
                  </button>
                  <input
                    ref={docFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,application/*"
                    multiple
                    className="hidden"
                    onChange={handleDocUpload}
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

                    {/* Attached Files preview right below author name */}
                    {attachments.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {attachments.map((att, idx) => {
                          const isImage = isImageAttachment(att);
                          const linkHref = att.url || (att.preview && att.preview.startsWith('http') ? att.preview : null);
                          const imgSrc = getImageSrc(att);

                          if (isImage) {
                            return (
                              <div 
                                key={idx}
                                onClick={() => handleOpenPreview({ name: att.name, preview: imgSrc, url: att.url })}
                                className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group cursor-pointer shadow-xs"
                              >
                                {imgSrc ? (
                                  <img 
                                    src={imgSrc} 
                                    alt={att.name || 'Attachment'} 
                                    className="w-full max-h-64 object-cover object-top group-hover:scale-[1.01] transition-transform duration-150" 
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div 
                                  style={{ display: imgSrc ? 'none' : 'flex' }}
                                  className="w-full h-32 items-center justify-center gap-2 bg-slate-100 text-slate-500 font-medium"
                                >
                                  <ImageIcon size={24} />
                                  <span>{att.name || 'Image'}</span>
                                </div>
                                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-2xs">
                                  <Eye size={16} /> Click to expand
                                </div>
                              </div>
                            );
                          } else {
                            const docUrl = linkHref || (att.preview && (att.preview.startsWith('http') || att.preview.startsWith('data:') || att.preview.startsWith('blob:')) ? att.preview : null);
                            const isReady = !!docUrl;

                            return isReady ? (
                              <a 
                                key={idx}
                                href={docUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                download={docUrl.startsWith('data:') ? (att.name || 'document') : undefined}
                                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs group cursor-pointer"
                                title={`Open ${att.name || 'Document'}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                                    <FileText size={20} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{att.name || 'Document'}</p>
                                    <p className="text-[11px] text-slate-400 uppercase font-medium">{att.name ? (att.name.split('.').pop() + ' File') : 'Document'}</p>
                                  </div>
                                </div>
                                <span className="shrink-0 text-xs text-blue-600 font-semibold group-hover:underline flex items-center gap-1">
                                  <Download size={14} /> Open
                                </span>
                              </a>
                            ) : (
                              <div 
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 shadow-2xs text-slate-500"
                                title="Uploading document to Zoho WorkDrive..."
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <div className="p-2 rounded-lg bg-slate-200 text-slate-600 shrink-0">
                                    <FileText size={20} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 truncate">{att.name || 'Document'}</p>
                                    <p className="text-[11px] text-slate-400 uppercase font-medium">{att.name ? (att.name.split('.').pop() + ' File') : 'Document'}</p>
                                  </div>
                                </div>
                                <span className="shrink-0 text-xs text-amber-600 font-medium flex items-center gap-1">
                                  Uploading...
                                </span>
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
                    const attMarker = '[ATTACHMENTS]:';
                    if (body && body.includes(attMarker)) {
                      const idx = body.indexOf(attMarker);
                      const jsonStr = body.substring(idx + attMarker.length).trim();
                      body = body.substring(0, idx).trim();
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
                                const isImage = isImageAttachment(att);
                                const linkHref = att.url || (att.preview && att.preview.startsWith('http') ? att.preview : null);
                                const imgSrc = getImageSrc(att);

                                if (isImage) {
                                  return (
                                    <div key={idx} className="relative group">
                                      {imgSrc ? (
                                        <div className="relative">
                                          <img 
                                            src={imgSrc} 
                                            alt={att.name || 'Image'} 
                                            className="h-16 w-16 object-cover rounded cursor-pointer hover:opacity-90 border border-white/20 shadow-xs"
                                            onClick={() => handleOpenPreview({ name: att.name, preview: imgSrc, url: att.url })}
                                            onError={(e) => {
                                              e.target.style.display = 'none';
                                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                            }}
                                          />
                                          <div 
                                            style={{ display: 'none' }}
                                            onClick={() => handleOpenPreview({ name: att.name, preview: imgSrc, url: att.url })}
                                            className="h-16 w-16 items-center justify-center bg-slate-200 text-slate-500 rounded text-[10px] cursor-pointer"
                                          >
                                            <ImageIcon size={20} />
                                          </div>
                                        </div>
                                      ) : (
                                        <a 
                                          href={linkHref} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className={`flex items-center gap-1.5 p-1.5 rounded border transition-colors ${
                                            isOwn ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-blue-600'
                                          }`}
                                        >
                                          <ImageIcon size={16} />
                                          <span className="text-xs truncate max-w-[100px] font-medium">{att.name}</span>
                                        </a>
                                      )}
                                    </div>
                                  );
                                } else {
                                  const docUrl = linkHref || (att.preview && (att.preview.startsWith('http') || att.preview.startsWith('data:') || att.preview.startsWith('blob:')) ? att.preview : null);
                                  const isReady = !!docUrl;

                                  return isReady ? (
                                    <div key={idx} className="relative group">
                                      <a 
                                        href={docUrl} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        download={docUrl.startsWith('data:') ? (att.name || 'document') : undefined}
                                        className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-colors ${
                                          isOwn ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                                        }`}
                                        title={`Open ${att.name || 'Document'}`}
                                      >
                                        <FileText size={16} className={isOwn ? 'text-white' : 'text-blue-600'} />
                                        <span className="text-xs truncate max-w-[120px] font-medium">{att.name || 'Document'}</span>
                                        <Download size={12} className="opacity-60 ml-0.5" />
                                      </a>
                                    </div>
                                  ) : (
                                    <div key={idx} className="relative group">
                                      <div 
                                        className={`flex items-center gap-1.5 p-1.5 rounded-lg border opacity-80 ${
                                          isOwn ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-100 border-slate-200 text-slate-700'
                                        }`}
                                        title="Uploading to Zoho WorkDrive..."
                                      >
                                        <FileText size={16} className={isOwn ? 'text-white' : 'text-blue-600'} />
                                        <span className="text-xs truncate max-w-[120px] font-medium">{att.name || 'Document'}</span>
                                        <span className="text-[10px] text-amber-500 font-medium ml-0.5">Uploading...</span>
                                      </div>
                                    </div>
                                  );
                                }
                              })}
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
                          {isImageAttachment(att) && att.preview ? (
                            <img src={att.preview} alt={att.name} className="h-10 w-10 object-cover rounded" />
                          ) : (
                            <FileText size={22} className="text-blue-600 shrink-0" />
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

                  <div className="flex items-end gap-1.5 w-full">
                    <button
                      type="button"
                      onClick={() => messageImageInputRef.current?.click()}
                      className="p-2 text-slate-400 hover:text-[#16234f] transition-colors flex-shrink-0 mb-1 cursor-pointer"
                      title="Attach image"
                    >
                      <ImageIcon size={20} />
                    </button>
                    <input 
                      type="file" 
                      accept="image/*"
                      multiple 
                      className="hidden" 
                      ref={messageImageInputRef} 
                      onChange={handleMessageImageUpload} 
                    />

                    <button
                      type="button"
                      onClick={() => messageDocInputRef.current?.click()}
                      className="p-2 text-slate-400 hover:text-[#16234f] transition-colors flex-shrink-0 mb-1 cursor-pointer"
                      title="Attach document (PDF, PPT, Word, Excel, etc.)"
                    >
                      <FileText size={20} />
                    </button>
                    <input 
                      type="file" 
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,application/*"
                      multiple 
                      className="hidden" 
                      ref={messageDocInputRef} 
                      onChange={handleMessageDocUpload} 
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
      {previewImage && (() => {
        const previewSrc = typeof previewImage === 'string' 
          ? previewImage 
          : (previewImage?.preview || previewImage?.url || '');
        const previewName = (typeof previewImage === 'object' && previewImage?.name) 
          ? previewImage.name 
          : 'Image Attachment';
        const downloadHref = (typeof previewImage === 'object' && (previewImage?.url || previewImage?.preview)) 
          ? (previewImage.url || previewImage.preview) 
          : (typeof previewImage === 'string' ? previewImage : '');

        return (
          <div 
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => { setPreviewImage(null); setLightboxError(false); }}
          >
            <div 
              className="relative max-w-4xl w-full max-h-[92vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Toolbar */}
              <div className="w-full flex items-center justify-between py-2.5 px-4 bg-slate-900/90 rounded-t-xl text-white">
                <span className="text-xs sm:text-sm font-medium truncate max-w-md">
                  📷 {previewName}
                </span>
                <div className="flex items-center gap-2">
                  {downloadHref && (
                    <a
                      href={downloadHref}
                      target="_blank"
                      rel="noreferrer"
                      download={previewName}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition cursor-pointer"
                    >
                      <Download size={14} /> Download / Open
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => { setPreviewImage(null); setLightboxError(false); }}
                    className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Image display */}
              <div className="bg-black/60 w-full flex items-center justify-center p-3 rounded-b-xl overflow-auto max-h-[82vh]">
                {previewSrc && !lightboxError ? (
                  <img
                    src={previewSrc}
                    alt={previewName}
                    className="max-h-[78vh] max-w-full object-contain rounded shadow-2xl"
                    onError={() => setLightboxError(true)}
                  />
                ) : (
                  <div className="text-slate-300 py-12 flex flex-col items-center gap-3 text-center">
                    <ImageIcon size={48} className="opacity-50" />
                    <p className="text-sm font-medium">Image preview unavailable</p>
                    {downloadHref && (
                      <a
                        href={downloadHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                      >
                        <Download size={14} /> Open in Zoho WorkDrive
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
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

              {/* Attached files management */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Attached Files
                  </label>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 font-semibold cursor-pointer"
                      title="Add screenshot image"
                    >
                      <ImageIcon size={13} /> Add Screenshot
                    </button>
                    <button
                      type="button"
                      onClick={() => editDocFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                      title="Add document file (PDF, PPT, etc.)"
                    >
                      <FileText size={13} /> Add Document
                    </button>
                  </div>
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleEditImageUpload}
                  />
                  <input
                    ref={editDocFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,application/*"
                    multiple
                    className="hidden"
                    onChange={handleEditDocUpload}
                  />
                </div>

                {editImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2.5 mt-2">
                    {editImages.map((img, idx) => {
                      const isImage = isImageAttachment(img);
                      const imgSrc = getImageSrc(img);
                      return (
                        <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50 h-20">
                          {isImage && imgSrc ? (
                            <img src={imgSrc} alt={img.name || 'Attachment'} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-600 bg-slate-100">
                              <FileText size={20} className="text-blue-600 mb-1" />
                              <span className="text-[10px] font-medium truncate w-full text-center" title={img.name}>{img.name || 'Document'}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeEditImage(idx)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-90 hover:opacity-100 transition cursor-pointer"
                            title="Remove attachment"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No files attached.</p>
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

        {/* Attached Screenshot / Document preview if available - prominent right below name */}
        {attachments.length > 0 && (() => {
          const firstImage = attachments.find(isImageAttachment);
          const nonImages = attachments.filter(a => !isImageAttachment(a));
          const firstDoc = nonImages[0];

          return (
            <div className="mb-3 space-y-1.5">
              {firstImage ? (
                <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 relative group">
                  {getImageSrc(firstImage) ? (
                    <img 
                      src={getImageSrc(firstImage)} 
                      alt={firstImage.name || 'Attached Screenshot'} 
                      className="w-full max-h-56 object-cover object-top hover:scale-[1.01] transition-transform duration-150"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenImage) onOpenImage({ name: firstImage.name, preview: getImageSrc(firstImage), url: firstImage.url });
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    style={{ display: getImageSrc(firstImage) ? 'none' : 'flex' }}
                    className="flex items-center justify-center gap-2 w-full py-4 text-blue-600 hover:bg-blue-50 font-medium transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (firstImage.url) window.open(firstImage.url, '_blank');
                      else if (onOpenImage) onOpenImage(firstImage);
                    }}
                  >
                    <ImageIcon size={20} />
                    <span>View {firstImage.name || 'Image'}</span>
                  </div>
                  {attachments.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs pointer-events-none">
                      +{attachments.length - 1} more
                    </span>
                  )}
                </div>
              ) : firstDoc ? (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    const href = firstDoc.url || (firstDoc.preview && firstDoc.preview.startsWith('http') ? firstDoc.preview : null);
                    if (href) window.open(href, '_blank');
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50 transition-colors ${
                    (firstDoc.url || (firstDoc.preview && firstDoc.preview.startsWith('http'))) ? 'hover:bg-blue-50/50 hover:border-blue-200 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={18} className="text-blue-600 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">{firstDoc.name || 'Document'}</span>
                  </div>
                  {attachments.length > 1 ? (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                      +{attachments.length - 1}
                    </span>
                  ) : (firstDoc.url || (firstDoc.preview && firstDoc.preview.startsWith('http'))) ? (
                    <Download size={14} className="text-slate-400" />
                  ) : (
                    <span className="text-[10px] text-amber-600 font-medium">Uploading...</span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })()}

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
