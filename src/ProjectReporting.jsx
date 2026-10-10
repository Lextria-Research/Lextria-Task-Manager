import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { 
  Plus, Clock, MessageSquare, X, Send, 
  User, Calendar, Search, Filter,
  Image as ImageIcon, Paperclip, FileText, Loader2, AlertCircle, Eye, Download, ExternalLink
} from 'lucide-react';
import { isImageAttachment, getImageSrc } from './attachmentUtils';
import { generateThumbnail } from './QueryTickets';

// Option A storage: attachments are appended to the project's description text
// as "[ATTACHMENTS]: [...]" (same format as Query tickets) — no database change needed.
const ATTACHMENTS_MARKER = '[ATTACHMENTS]:';

const splitDescription = (description) => {
  if (!description || !description.includes(ATTACHMENTS_MARKER)) {
    return { text: description || '', attachments: [] };
  }
  const idx = description.indexOf(ATTACHMENTS_MARKER);
  const text = description.substring(0, idx).trim();
  let attachments = [];
  try {
    const parsed = JSON.parse(description.substring(idx + ATTACHMENTS_MARKER.length).trim());
    if (Array.isArray(parsed)) attachments = parsed;
  } catch (e) {
    console.error('Failed to parse project attachments', e);
  }
  return { text, attachments };
};

const buildDescription = (text, attachments) => {
  const clean = (text || '').trim();
  if (!attachments || attachments.length === 0) return clean;
  return `${clean}\n\n${ATTACHMENTS_MARKER} ${JSON.stringify(attachments)}`;
};

const STATUSES = ['Not Started', 'In Progress', 'Client Review', 'On Hold', 'Completed'];
const URGENCIES = ['High', 'Medium', 'Low'];

export default function ProjectReporting({ agents = [], isAdmin = false, session = null }) {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState('All Clients');
  const [activeTab, setActiveTab] = useState('Board'); // 'Board' | 'History'
  const [urgencyFilter, setUrgencyFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [agentsList, setAgentsList] = useState(agents);
  
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ client: '', title: '', description: '', urgency: 'Medium' });
  const [newProjectAttachments, setNewProjectAttachments] = useState([]);
  const [creating, setCreating] = useState(false);
  const [previewImage, setPreviewImage] = useState(null); // { name, src, url }
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  
  const [selectedProject, setSelectedProject] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [newUpdate, setNewUpdate] = useState('');

  useEffect(() => {
    fetchProjects();
    supabase.from('agents').select('id, name').then(({ data }) => {
      if (data && data.length > 0) setAgentsList(data);
    });
  }, []);

  const resolveAgentId = (userName) => {
    if (!userName) return null;
    const clean = userName.replace(/\s+/g, '').toLowerCase();
    const list = agentsList.length > 0 ? agentsList : agents;
    const found = list.find(a => a.name?.replace(/\s+/g, '').toLowerCase() === clean);
    return found ? found.id : null;
  };

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching projects:', error);
      return;
    }
    setProjects(data || []);
    
    const uniqueClients = [...new Set((data || []).map(p => p.client).filter(Boolean))];
    setClients(uniqueClients);
  };

  const fetchUpdates = async (projectId) => {
    const { data, error } = await supabase
      .from('project_updates')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
      
    if (error) console.error('Error fetching updates:', error);
    else setUpdates(data || []);
  };

  // --- New Project attachment pickers ---
  const readAsDataUrl = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

  const addPickedFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const isImg = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
      if (isImg) {
        const preview = await readAsDataUrl(file);
        setNewProjectAttachments(prev => [...prev, { name: file.name, type: file.type || 'image/png', preview, file }]);
      } else {
        setNewProjectAttachments(prev => [...prev, { name: file.name, type: file.type || 'application/octet-stream', preview: '', file }]);
      }
    }
  };

  const handleImagePick = (e) => { addPickedFiles(e.target.files); e.target.value = ''; };
  const handleDocPick = (e) => { addPickedFiles(e.target.files); e.target.value = ''; };

  const removeNewProjectAttachment = (index) => {
    setNewProjectAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const closeNewProjectModal = () => {
    if (creating) return;
    setIsNewModalOpen(false);
    setNewProject({ client: '', title: '', description: '', urgency: 'Medium' });
    setNewProjectAttachments([]);
  };

  // Uploads each file to Zoho WorkDrive via /api/upload, then saves the real URLs into the project.
  // Files are independent: one failure never removes the project or the other files.
  const uploadProjectAttachments = async (projectRow, descriptionText, pendingList) => {
    try {
      const finalAttachments = await Promise.all(pendingList.map(async (att) => {
        const { file, pending, ...meta } = att;
        if (!file) return meta;
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (res.ok) {
            const data = await res.json();
            if (data.url) return { ...meta, url: data.url };
          }
          console.error('Upload returned no URL for', att.name);
        } catch (err) {
          console.error('Upload failed for', att.name, err);
        }
        return { ...meta, failed: true };
      }));

      const newDescription = buildDescription(descriptionText, finalAttachments);
      const { error } = await supabase
        .from('projects')
        .update({ description: newDescription })
        .eq('id', projectRow.id);

      if (error) {
        console.error('Failed to save attachment links:', error);
        return;
      }
      setProjects(prev => prev.map(p => p.id === projectRow.id ? { ...p, description: newDescription } : p));
      setSelectedProject(prev => (prev && prev.id === projectRow.id ? { ...prev, description: newDescription } : prev));
    } catch (err) {
      console.error('Background project attachment upload failed', err);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.title || !newProject.client || creating) return;
    setCreating(true);

    try {
      const agentId = resolveAgentId(session?.name);

      // Lightweight records: compressed thumbnails for images; raw files stay in memory only
      const pendingList = [];
      for (const att of newProjectAttachments) {
        if (isImageAttachment(att)) {
          const thumb = await generateThumbnail(att.preview);
          pendingList.push({ name: att.name, type: att.file?.type || att.type || 'image/png', preview: thumb, pending: true, file: att.file });
        } else {
          pendingList.push({ name: att.name, type: att.file?.type || att.type || 'application/octet-stream', preview: '', pending: true, file: att.file });
        }
      }
      const toSave = pendingList.map(({ file, ...rest }) => rest);
      const descriptionText = newProject.description;

      const { data, error } = await supabase.from('projects').insert([{
        title: newProject.title,
        client: newProject.client,
        description: buildDescription(descriptionText, toSave),
        urgency: newProject.urgency,
        created_by: agentId,
        status: 'Not Started'
      }]).select();

      if (error || !data || data.length === 0) {
        console.error('Error creating project:', error);
        alert('Error creating project: ' + (error?.message || 'Please check connection.'));
        return; // Modal stays open with everything the user entered
      }

      const created = data[0];
      setProjects(prev => [created, ...prev]);
      if (!clients.includes(newProject.client)) {
        setClients(prev => [...prev, newProject.client]);
      }
      setIsNewModalOpen(false);
      setNewProject({ client: '', title: '', description: '', urgency: 'Medium' });
      setNewProjectAttachments([]);

      if (pendingList.some(a => a.file)) {
        uploadProjectAttachments(created, descriptionText, pendingList);
      }
    } finally {
      setCreating(false);
    }
  };

  const updateProjectStatus = async (projectId, newStatus) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', projectId);
      
    if (!error) {
      setProjects(projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p));
      if (selectedProject?.id === projectId) {
        setSelectedProject({ ...selectedProject, status: newStatus });
      }
    }
  };

  const postUpdate = async () => {
    if (!newUpdate.trim() || !selectedProject) return;
    
    const agentId = resolveAgentId(session?.name);
    const authorName = session?.name || 'Member';
    const contentWithAuthor = `[${authorName}]: ${newUpdate.trim()}`;
    
    const { data, error } = await supabase.from('project_updates').insert([{
      project_id: selectedProject.id,
      agent_id: agentId,
      content: contentWithAuthor
    }]).select();
    
    if (!error && data) {
      setUpdates([...updates, data[0]]);
      setNewUpdate('');
    } else if (error) {
      console.error('Error posting update:', error);
      alert('Error posting update: ' + (error.message || 'Please check connection.'));
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
    
    // Optimistic update
    const previousProjects = [...projects];
    const previousSelected = selectedProject;
    
    setProjects(projects.filter(p => p.id !== projectId));
    setSelectedProject(null);

    // Delete associated updates first (if any cascading delete issues exist, this is safer)
    await supabase.from('project_updates').delete().eq('project_id', projectId);
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
      
    if (error) {
      console.error('Error deleting project:', error);
      alert('Could not delete project: ' + (error.message || 'Please check connection.'));
      // Rollback on failure
      setProjects(previousProjects);
      setSelectedProject(previousSelected);
    } else {
      // Clean up clients if this was the last project for that client
      const deletedProject = previousProjects.find(p => p.id === projectId);
      const remainingForClient = previousProjects.filter(p => p.id !== projectId && p.client === deletedProject?.client);
      if (remainingForClient.length === 0) {
        setClients(clients.filter(c => c !== deletedProject?.client));
        if (activeClient === deletedProject?.client) {
          setActiveClient('All Clients');
        }
      }
    }
  };

  const openProjectDetails = (project) => {
    setSelectedProject(project);
    fetchUpdates(project.id);
  };

  const filteredProjects = projects.filter(p => {
    const matchesClient = activeClient === 'All Clients' || p.client === activeClient;
    const matchesUrgency = urgencyFilter === 'All' || p.urgency === urgencyFilter;
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          splitDescription(p.description).text.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesClient && matchesUrgency && matchesSearch;
  });

  const boardProjects = filteredProjects.filter(p => p.status !== 'Completed');
  const historyProjects = filteredProjects.filter(p => p.status === 'Completed');

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#f0f2f5' }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Reporting Board</h1>
          <p className="text-gray-500 mt-1">Keep the leader up to date on every client project so nothing gets missed.</p>
        </div>
        <button 
          onClick={() => setIsNewModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-md shadow-sm"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <Plus size={18} /> New project
        </button>
      </div>

      {/* Client Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveClient('All Clients')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium ${
            activeClient === 'All Clients' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          All Clients
        </button>
        {clients.map(client => (
          <button
            key={client}
            onClick={() => setActiveClient(client)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              activeClient === client ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {client}
          </button>
        ))}
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b border-gray-200 pb-2">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('Board')}
            className={`px-4 py-2 rounded-t-md font-medium text-sm ${
              activeTab === 'Board' ? 'bg-white border-t border-l border-r border-gray-200 text-gray-900 -mb-[9px] z-10 relative' : 'text-gray-500'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setActiveTab('History')}
            className={`px-4 py-2 rounded-t-md font-medium text-sm ${
              activeTab === 'History' ? 'bg-white border-t border-l border-r border-gray-200 text-gray-900 -mb-[9px] z-10 relative' : 'text-gray-500'
            }`}
          >
            History
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 font-medium text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
            >
              <option value="All" className="text-gray-900 bg-white">All Urgencies</option>
              {URGENCIES.map(u => <option key={u} value={u} className="text-gray-900 bg-white">{u}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] w-64"
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'Board' ? (
        <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-280px)]">
          {STATUSES.filter(s => s !== 'Completed').map(status => {
            const columnProjects = boardProjects.filter(p => p.status === status);
            return (
              <div key={status} className="flex-shrink-0 w-80 flex flex-col">
                <div className="bg-white rounded-md shadow-sm border border-gray-200 p-3 mb-3 flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{status}</h3>
                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                    {columnProjects.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3">
                  {columnProjects.map(project => (
                    <div 
                      key={project.id} 
                      onClick={() => openProjectDetails(project)}
                      className="bg-white p-4 rounded-md shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{project.client}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getUrgencyColor(project.urgency)}`}>
                          {project.urgency}
                        </span>
                      </div>
                      <h4 className="font-medium text-gray-900 mb-2">{project.title}</h4>
                      <div className="flex items-center text-gray-500 text-xs gap-4 mt-3">
                        <div className="flex items-center gap-1"><Clock size={14}/> {new Date(project.created_at).toLocaleDateString()}</div>
                        {(() => {
                          const count = splitDescription(project.description).attachments.length;
                          return count > 0 ? (
                            <div className="flex items-center gap-1" title={`${count} attachment${count > 1 ? 's' : ''}`}>
                              <Paperclip size={13} /> {count}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {historyProjects.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-500">No completed projects found.</div>
          ) : (
            historyProjects.map(project => (
              <div 
                key={project.id} 
                onClick={() => openProjectDetails(project)}
                className="bg-white p-5 rounded-md shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{project.client}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getUrgencyColor(project.urgency)}`}>
                    {project.urgency}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">{project.title}</h4>
                <p className="text-sm text-gray-600 line-clamp-2 mb-4">{splitDescription(project.description).text}</p>
                <div className="flex items-center text-gray-500 text-xs justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1"><Calendar size={14}/> Completed</div>
                  {splitDescription(project.description).attachments.length > 0 && (
                    <div className="flex items-center gap-1"><Paperclip size={13} /> {splitDescription(project.description).attachments.length}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Project Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">New Project</h2>
              <button onClick={closeNewProjectModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                <input 
                  type="text" 
                  value={newProject.client}
                  onChange={e => setNewProject({...newProject, client: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
                <input 
                  type="text" 
                  value={newProject.title}
                  onChange={e => setNewProject({...newProject, title: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="What needs to be done?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                <select
                  value={newProject.urgency}
                  onChange={e => setNewProject({...newProject, urgency: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                >
                  {URGENCIES.map(u => <option key={u} value={u} className="text-gray-900 bg-white">{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  value={newProject.description}
                  onChange={e => setNewProject({...newProject, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] h-24 resize-none"
                  placeholder="Add details..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachments <span className="text-gray-400 font-normal">(optional)</span></label>
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
                <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv" multiple className="hidden" onChange={handleDocPick} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <ImageIcon size={15} /> Attach image
                  </button>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Paperclip size={15} /> Attach document
                  </button>
                </div>
                {newProjectAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {newProjectAttachments.map((att, i) => (
                      <div key={`new-att-${i}`} className="relative flex items-center rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
                        {isImageAttachment(att) && att.preview ? (
                          <img src={att.preview} alt={att.name} className="w-16 h-16 object-cover" />
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-2 max-w-[180px]">
                            <FileText size={15} className="text-[#1e3a5f] shrink-0" />
                            <span className="truncate text-xs text-gray-700">{att.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeNewProjectAttachment(i)}
                          className="absolute top-0.5 right-0.5 bg-white/90 hover:bg-white rounded-full p-0.5 text-gray-500 hover:text-red-600 shadow"
                          title="Remove attachment"
                          aria-label={`Remove ${att.name}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
              <button 
                onClick={closeNewProjectModal}
                disabled={creating}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateProject}
                disabled={creating}
                className="px-4 py-2 rounded-md text-white font-medium flex items-center gap-2 disabled:opacity-70"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                {creating && <Loader2 size={16} className="animate-spin" />}
                {creating ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[85vh] flex flex-col md:flex-row overflow-hidden">
            {/* Left side: Info */}
            <div className="w-full md:w-1/2 p-6 overflow-y-auto border-r border-gray-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">{selectedProject.client}</span>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedProject.title}</h2>
                </div>
                <button onClick={() => setSelectedProject(null)} className="md:hidden text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>

              <div className="flex gap-3 mb-6">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getUrgencyColor(selectedProject.urgency)}`}>
                  {selectedProject.urgency} Urgency
                </span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                  {selectedProject.status}
                </span>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Description</h3>
                <div className="bg-gray-50 p-4 rounded-md text-gray-700 whitespace-pre-wrap border border-gray-100">
                  {splitDescription(selectedProject.description).text || 'No description provided.'}
                </div>
              </div>

              {/* Attachments Preview section right below description */}
              {(() => {
                const { attachments } = splitDescription(selectedProject.description);
                if (!attachments || attachments.length === 0) return null;
                return (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <Paperclip size={15} /> Attachments ({attachments.length})
                    </h3>
                    <div className="space-y-2.5">
                      {attachments.map((att, idx) => {
                        const isImg = isImageAttachment(att);
                        const imgSrc = isImg ? getImageSrc(att) : '';
                        const linkHref = att.url || (att.preview && att.preview.startsWith('http') ? att.preview : null);
                        const isUploading = att.pending || (!att.url && !att.failed && !att.preview);
                        const isFailed = !!att.failed;

                        if (isImg) {
                          return (
                            <div 
                              key={idx}
                              onClick={() => {
                                if (imgSrc || linkHref) {
                                  setPreviewImage({ name: att.name, src: imgSrc, url: linkHref });
                                }
                              }}
                              className={`rounded-xl overflow-hidden border border-gray-200 bg-gray-50 relative group shadow-xs ${
                                (imgSrc || linkHref) ? 'cursor-pointer hover:border-gray-300' : 'cursor-default'
                              }`}
                            >
                              {imgSrc ? (
                                <img 
                                  src={imgSrc} 
                                  alt={att.name || 'Attachment'} 
                                  className="w-full max-h-56 object-cover object-top group-hover:scale-[1.01] transition-transform duration-150" 
                                />
                              ) : (
                                <div className="w-full h-28 flex items-center justify-center gap-2 bg-gray-100 text-gray-500 font-medium">
                                  <ImageIcon size={22} />
                                  <span className="text-xs truncate max-w-xs">{att.name || 'Image'}</span>
                                </div>
                              )}
                              
                              {/* Hover overlay if image is ready */}
                              {(imgSrc || linkHref) && !isUploading && (
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold backdrop-blur-xs">
                                  <Eye size={16} /> Click to expand
                                </div>
                              )}

                              {/* Uploading / Failed badge */}
                              {isUploading && (
                                <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[11px] py-1 px-2 flex items-center justify-center gap-1.5 font-medium">
                                  <Loader2 size={12} className="animate-spin" /> Uploading to WorkDrive…
                                </div>
                              )}
                              {isFailed && (
                                <div className="absolute bottom-0 inset-x-0 bg-red-600/90 text-white text-[11px] py-1 px-2 flex items-center justify-center gap-1.5 font-medium">
                                  <AlertCircle size={12} /> Upload failed
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          const docUrl = linkHref;
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                                  <FileText size={18} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-gray-800 truncate" title={att.name}>
                                    {att.name || 'Document'}
                                  </div>
                                  <div className="text-[10px] text-gray-400">
                                    {isUploading ? (
                                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                                        <Loader2 size={10} className="animate-spin" /> Uploading to WorkDrive…
                                      </span>
                                    ) : isFailed ? (
                                      <span className="text-red-500 font-medium">Upload failed</span>
                                    ) : (
                                      <span>Zoho WorkDrive Document</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {docUrl && !isUploading && (
                                <a
                                  href={docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={docUrl.startsWith('data:') ? (att.name || 'document') : undefined}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1e3a5f] hover:bg-[#162a45] text-white text-xs font-medium transition shrink-0"
                                  title="Open in Zoho WorkDrive"
                                >
                                  <ExternalLink size={12} />
                                  <span>Open / Download</span>
                                </a>
                              )}
                            </div>
                          );
                        }
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Update Status</h3>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(status => (
                    <button
                      key={status}
                      onClick={() => updateProjectStatus(selectedProject.id, status)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                        selectedProject.status === status 
                          ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' 
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-auto pt-6 border-t border-gray-100 flex items-center justify-between">
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <Calendar size={16} /> Created on {new Date(selectedProject.created_at).toLocaleDateString()}
                </div>
                <button 
                  onClick={() => handleDeleteProject(selectedProject.id)}
                  className="text-red-600 hover:text-red-800 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                >
                  Delete Project
                </button>
              </div>
            </div>

            {/* Right side: Discussion */}
            <div className="w-full md:w-1/2 flex flex-col bg-gray-50 h-full relative">
              <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <MessageSquare size={18} /> Discussion
                </h3>
                <button onClick={() => setSelectedProject(null)} className="hidden md:block text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {updates.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">No updates yet. Start the conversation!</div>
                ) : (
                  updates.map(update => {
                    let agentName = 'Team Member';
                    let content = update.content;
                    if (content && content.startsWith('[') && content.includes(']: ')) {
                      const closing = content.indexOf(']: ');
                      agentName = content.substring(1, closing);
                      content = content.substring(closing + 3);
                    } else if (update.agent_id) {
                      const list = agentsList.length > 0 ? agentsList : agents;
                      const agent = list.find(a => a.id === update.agent_id);
                      if (agent) agentName = agent.name;
                    }

                    return (
                      <div key={update.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-sm text-[#1e3a5f] flex items-center gap-1">
                            <User size={14} /> {agentName}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(update.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{content}</p>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex items-end gap-2">
                  <textarea
                    value={newUpdate}
                    onChange={(e) => setNewUpdate(e.target.value)}
                    placeholder="Type an update..."
                    className="flex-1 border border-gray-300 rounded-md p-2 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] resize-none h-20 text-sm"
                  />
                  <button 
                    onClick={postUpdate}
                    disabled={!newUpdate.trim()}
                    className="p-2 rounded-md text-white bg-[#1e3a5f] disabled:opacity-50 mb-1"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview / Expand Lightbox Modal */}
      {previewImage && (() => {
        const previewSrc = typeof previewImage === 'string' 
          ? previewImage 
          : (previewImage?.src || previewImage?.preview || previewImage?.url || '');
        const previewName = (typeof previewImage === 'object' && previewImage?.name) 
          ? previewImage.name 
          : 'Attachment Preview';
        const downloadHref = (typeof previewImage === 'object' && (previewImage?.url || previewImage?.src || previewImage?.preview)) 
          ? (previewImage.url || previewImage.src || previewImage.preview) 
          : (typeof previewImage === 'string' ? previewImage : '');

        return (
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
                    onClick={() => setPreviewImage(null)}
                    className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Image display */}
              <div className="bg-black/60 w-full flex items-center justify-center p-3 rounded-b-xl overflow-auto max-h-[82vh]">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt={previewName}
                    className="max-h-[78vh] max-w-full object-contain rounded shadow-2xl"
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
                        <ExternalLink size={14} /> Open in Zoho WorkDrive
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
