import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { 
  Plus, Clock, MessageSquare, X, Send, 
  User, Calendar, Search, Filter,
  Image as ImageIcon, Paperclip, FileText, Loader2, AlertCircle
} from 'lucide-react';
import { isImageAttachment, getImageSrc } from './attachmentUtils';
import { generateThumbnail } from './QueryTickets';

const ATTACHMENTS_MARKER = '[ATTACHMENTS]:';

// Splits an update's content into plain text and parsed attachment list
const splitAttachments = (content) => {
  if (!content || !content.includes(ATTACHMENTS_MARKER)) return { text: content || '', attachments: [] };
  const idx = content.indexOf(ATTACHMENTS_MARKER);
  const text = content.substring(0, idx).trim();
  let attachments = [];
  try {
    const parsed = JSON.parse(content.substring(idx + ATTACHMENTS_MARKER.length).trim());
    if (Array.isArray(parsed)) attachments = parsed;
  } catch (e) {
    console.error('Failed to parse project update attachments', e);
  }
  return { text, attachments };
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
  
  const [selectedProject, setSelectedProject] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [newUpdate, setNewUpdate] = useState('');
  const [updateAttachments, setUpdateAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  const selectedProjectRef = useRef(null);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

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
    else if (!selectedProjectRef.current || selectedProjectRef.current.id === projectId) {
      // Ignore stale responses from a previously opened project
      setUpdates(data || []);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.title || !newProject.client) return;
    const agentId = resolveAgentId(session?.name);

    const { data, error } = await supabase.from('projects').insert([{
      title: newProject.title,
      client: newProject.client,
      description: newProject.description,
      urgency: newProject.urgency,
      created_by: agentId,
      status: 'Not Started'
    }]).select();
    
    if (error) {
      console.error('Error creating project:', error);
      alert('Error creating project: ' + (error.message || 'Please check connection.'));
    } else {
      setProjects([data[0], ...projects]);
      if (!clients.includes(newProject.client)) {
        setClients([...clients, newProject.client]);
      }
      setIsNewModalOpen(false);
      setNewProject({ client: '', title: '', description: '', urgency: 'Medium' });
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

  // --- Attachment pickers ---
  const handleImagePick = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUpdateAttachments(prev => [...prev, {
          name: file.name,
          type: file.type || 'image/png',
          preview: ev.target.result,
          file
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDocPick = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const isImg = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
      if (isImg) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setUpdateAttachments(prev => [...prev, { name: file.name, type: file.type || 'image/png', preview: ev.target.result, file }]);
        };
        reader.readAsDataURL(file);
      } else {
        setUpdateAttachments(prev => [...prev, { name: file.name, type: file.type || 'application/octet-stream', preview: '', file }]);
      }
    });
    e.target.value = '';
  };

  const removeUpdateAttachment = (index) => {
    setUpdateAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Uploads files to Zoho WorkDrive via /api/upload, then patches the update row with real URLs.
  // Each file is independent: one failure never discards the others or the message text.
  const uploadProjectAttachments = async (updateRow, pendingList) => {
    try {
      const finalAttachments = await Promise.all(pendingList.map(async (att) => {
        const { file, ...meta } = att;
        if (!file) return meta;
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              const { pending, failed, ...rest } = meta;
              return { ...rest, url: data.url };
            }
          }
          console.error('Upload returned no URL for', att.name);
        } catch (err) {
          console.error('Upload failed for', att.name, err);
        }
        const { pending, ...rest } = meta;
        return { ...rest, failed: true };
      }));

      const { text } = splitAttachments(updateRow.content);
      const newContent = `${text}\n${ATTACHMENTS_MARKER} ${JSON.stringify(finalAttachments)}`;

      const { error } = await supabase
        .from('project_updates')
        .update({ content: newContent })
        .eq('id', updateRow.id);

      if (error) {
        console.error('Failed to save attachment URLs:', error);
        return;
      }
      setUpdates(prev => prev.map(u => u.id === updateRow.id ? { ...u, content: newContent } : u));
    } catch (err) {
      console.error('Background project attachment upload failed', err);
    }
  };

  const postUpdate = async () => {
    if ((!newUpdate.trim() && updateAttachments.length === 0) || !selectedProject || sending) return;
    setSending(true);

    try {
      const agentId = resolveAgentId(session?.name);
      const authorName = session?.name || 'Member';
      let contentWithAuthor = `[${authorName}]: ${newUpdate.trim()}`;

      // Build lightweight records (compressed thumbnails for images) — raw files are kept only in memory
      const pendingList = [];
      for (const att of updateAttachments) {
        if (isImageAttachment(att)) {
          const thumb = await generateThumbnail(att.preview);
          pendingList.push({ name: att.name, type: att.file?.type || att.type || 'image/png', preview: thumb, pending: true, file: att.file });
        } else {
          pendingList.push({ name: att.name, type: att.file?.type || att.type || 'application/octet-stream', preview: '', pending: true, file: att.file });
        }
      }

      if (pendingList.length > 0) {
        const toSave = pendingList.map(({ file, ...rest }) => rest);
        contentWithAuthor += `\n${ATTACHMENTS_MARKER} ${JSON.stringify(toSave)}`;
      }

      const { data, error } = await supabase.from('project_updates').insert([{
        project_id: selectedProject.id,
        agent_id: agentId,
        content: contentWithAuthor
      }]).select();

      if (error || !data || data.length === 0) {
        console.error('Error posting update:', error);
        alert('Error posting update: ' + (error?.message || 'Please check connection.'));
        return; // Composer is kept intact so nothing typed or attached is lost
      }

      const inserted = data[0];
      setUpdates(prev => [...prev, inserted]);
      setNewUpdate('');
      setUpdateAttachments([]);

      if (pendingList.some(a => a.file)) {
        uploadProjectAttachments(inserted, pendingList);
      }
    } finally {
      setSending(false);
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
    selectedProjectRef.current = project;
    setSelectedProject(project);
    setUpdates([]);
    setUpdateAttachments([]);
    fetchUpdates(project.id);
  };

  const filteredProjects = projects.filter(p => {
    const matchesClient = activeClient === 'All Clients' || p.client === activeClient;
    const matchesUrgency = urgencyFilter === 'All' || p.urgency === urgencyFilter;
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
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
                <p className="text-sm text-gray-600 line-clamp-2 mb-4">{project.description}</p>
                <div className="flex items-center text-gray-500 text-xs justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1"><Calendar size={14}/> Completed</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Project Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">New Project</h2>
              <button onClick={() => setIsNewModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
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
            </div>
            <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
              <button 
                onClick={() => setIsNewModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateProject}
                className="px-4 py-2 rounded-md text-white font-medium"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                Create project
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

              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Description</h3>
                <div className="bg-gray-50 p-4 rounded-md text-gray-700 whitespace-pre-wrap border border-gray-100">
                  {selectedProject.description || 'No description provided.'}
                </div>
              </div>

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
                    const { text: bodyText, attachments: atts } = splitAttachments(content);

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
                        {bodyText && <p className="text-gray-700 text-sm whitespace-pre-wrap">{bodyText}</p>}
                        {atts.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {atts.map((att, i) => {
                              const isImg = isImageAttachment(att);
                              const imgSrc = isImg ? getImageSrc(att) : '';
                              const status = att.url ? 'done' : att.failed ? 'failed' : 'uploading';
                              const Wrapper = att.url ? 'a' : 'div';
                              const wrapperProps = att.url ? { href: att.url, target: '_blank', rel: 'noopener noreferrer' } : {};
                              return (
                                <Wrapper
                                  key={`${update.id}-att-${i}`}
                                  {...wrapperProps}
                                  title={att.url ? `Open ${att.name} in WorkDrive` : att.name}
                                  className={`group relative flex items-center gap-2 rounded-md border text-xs overflow-hidden ${
                                    status === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                                  } ${att.url ? 'cursor-pointer' : 'cursor-default'}`}
                                >
                                  {isImg && imgSrc ? (
                                    <img src={imgSrc} alt={att.name} className="w-24 h-24 object-cover" />
                                  ) : (
                                    <div className="flex items-center gap-2 px-3 py-2 max-w-[220px]">
                                      {isImg ? <ImageIcon size={16} className="text-[#1e3a5f] shrink-0" /> : <FileText size={16} className="text-[#1e3a5f] shrink-0" />}
                                      <span className="truncate text-gray-700">{att.name}</span>
                                    </div>
                                  )}
                                  {status !== 'done' && (
                                    <div className={`absolute bottom-0 inset-x-0 flex items-center justify-center gap-1 py-0.5 text-[10px] font-medium ${
                                      status === 'failed' ? 'bg-red-600/90 text-white' : 'bg-black/60 text-white'
                                    }`}>
                                      {status === 'failed'
                                        ? (<><AlertCircle size={10} /> Upload failed</>)
                                        : (<><Loader2 size={10} className="animate-spin" /> Uploading…</>)}
                                    </div>
                                  )}
                                </Wrapper>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 bg-white border-t border-gray-200">
                {updateAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {updateAttachments.map((att, i) => (
                      <div key={`pending-${i}`} className="relative flex items-center rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
                        {isImageAttachment(att) && att.preview ? (
                          <img src={att.preview} alt={att.name} className="w-14 h-14 object-cover" />
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 max-w-[180px]">
                            <FileText size={14} className="text-[#1e3a5f] shrink-0" />
                            <span className="truncate text-xs text-gray-700">{att.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeUpdateAttachment(i)}
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
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
                <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv" multiple className="hidden" onChange={handleDocPick} />
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1 mb-1">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-[#1e3a5f]"
                      title="Attach image"
                      aria-label="Attach image"
                    >
                      <ImageIcon size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-[#1e3a5f]"
                      title="Attach document (PDF, Word, PowerPoint, Excel)"
                      aria-label="Attach document"
                    >
                      <Paperclip size={16} />
                    </button>
                  </div>
                  <textarea
                    value={newUpdate}
                    onChange={(e) => setNewUpdate(e.target.value)}
                    placeholder="Type an update..."
                    className="flex-1 border border-gray-300 rounded-md p-2 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] resize-none h-20 text-sm"
                  />
                  <button 
                    onClick={postUpdate}
                    disabled={sending || (!newUpdate.trim() && updateAttachments.length === 0)}
                    className="p-2 rounded-md text-white bg-[#1e3a5f] disabled:opacity-50 mb-1"
                    title="Send update"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
