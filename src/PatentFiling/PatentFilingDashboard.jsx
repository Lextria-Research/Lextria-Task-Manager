// src/PatentFiling/PatentFilingDashboard.jsx
// Main container and toolbar for the Patent Filing Workflow

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  RotateCcw,
  Archive,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Flame,
  LayoutGrid
} from 'lucide-react';
import { PATENT_ROLES, hasPatentRole } from '../patent/patentStateMachine.js';
import { fetchAllPatentRoleRecords } from '../patent/patentRoles.js';
import PatentKanbanBoard from './PatentKanbanBoard.jsx';
import PatentDetailDrawer from './PatentDetailDrawer.jsx';
import NewFilingModal from './NewFilingModal.jsx';
import {
  loadFilingsFromStorage,
  saveNewFilingToStorage,
  executeTransitionInStorage,
  executeReassignInStorage
} from './patentStorage.js';

export default function PatentFilingDashboard({
  currentUser,
  allEmployees = [],
  userRoles = []
}) {
  const [filings, setFilings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [personFilter, setPersonFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [viewScope, setViewScope] = useState('ALL'); // 'MY' | 'ALL'
  const [showClosedArchive, setShowClosedArchive] = useState(false);

  // Modals & Drawers
  const [showNewFilingModal, setShowNewFilingModal] = useState(false);
  const [selectedFiling, setSelectedFiling] = useState(null);
  const [notification, setNotification] = useState(null);
  const [patentRoleRecords, setPatentRoleRecords] = useState(null);

  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN);

  // Auto-dismiss toast notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load filings and dynamic role records on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      const [loaded, roles] = await Promise.all([
        loadFilingsFromStorage(allEmployees),
        fetchAllPatentRoleRecords()
      ]);
      setFilings(loaded);
      if (roles) setPatentRoleRecords(roles);
      setLoading(false);
    }
    init();
  }, [allEmployees]);

  // Unique filing types for filter dropdown
  const filingTypes = useMemo(() => {
    const set = new Set(filings.map(f => f.filing_type).filter(Boolean));
    return Array.from(set);
  }, [filings]);

  // Filtered filings based on search & toolbar filters
  const filteredFilings = useMemo(() => {
    return filings.filter(f => {
      // Search query (code, assignee, auditor, type)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const codeMatch = (f.code || '').toLowerCase().includes(q);
        const assigneeMatch = (f.assignee_name || '').toLowerCase().includes(q);
        const auditorMatch = (f.auditor_name || '').toLowerCase().includes(q);
        const typeMatch = (f.filing_type || '').toLowerCase().includes(q);
        if (!codeMatch && !assigneeMatch && !auditorMatch && !typeMatch) {
          return false;
        }
      }

      // Person filter
      if (personFilter !== 'ALL') {
        const isAssignee = String(f.assignee_id) === String(personFilter);
        const isAuditor = String(f.auditor_id) === String(personFilter);
        if (!isAssignee && !isAuditor) return false;
      }

      // Type filter
      if (typeFilter !== 'ALL' && f.filing_type !== typeFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'ALL' && f.priority !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [filings, searchQuery, personFilter, typeFilter, priorityFilter]);

  // Create new filing handler
  const handleCreateFiling = async (filingData) => {
    const res = await saveNewFilingToStorage(filingData, currentUser, allEmployees);
    if (res.success) {
      setFilings(prev => [res.filing, ...prev]);
      setNotification({
        type: 'success',
        message: `Filing code "${res.filing.code}" successfully created and assigned!`
      });
      return { success: true };
    }
    return res;
  };

  // State machine transition handler
  const handleTransition = async (toStatus, payload = {}, note = '') => {
    if (!selectedFiling) return;
    const res = await executeTransitionInStorage({
      filing: selectedFiling,
      toStatus,
      actor: currentUser,
      actorRoles: userRoles,
      note,
      payload
    });

    if (res.success) {
      setFilings(prev => prev.map(f => f.id === res.filing.id ? { ...f, ...res.filing } : f));
      setSelectedFiling(prev => ({ ...prev, ...res.filing }));
      setNotification({
        type: 'success',
        message: `Filing ${res.filing.code} moved to ${toStatus}.`
      });
      return { success: true };
    }

    return res;
  };

  // Reassignment handler
  const handleReassign = async (newAssigneeId, newAuditorId, reason) => {
    if (!selectedFiling) return;
    const res = await executeReassignInStorage({
      filing: selectedFiling,
      newAssigneeId,
      newAuditorId,
      reason,
      actor: currentUser,
      actorRoles: userRoles,
      allMembers: allEmployees
    });

    if (res.success) {
      setFilings(prev => prev.map(f => f.id === res.filing.id ? res.filing : f));
      setSelectedFiling(res.filing);
      setNotification({
        type: 'success',
        message: `Filing ${res.filing.code} reassigned successfully.`
      });
      return { success: true };
    }

    return res;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-5 px-6 py-4 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-8 z-[70] p-4 rounded-2xl bg-emerald-600/90 border border-emerald-400 text-white shadow-2xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md animate-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={16} />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-lg border border-white/10">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Patent Filing Workflow
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 uppercase tracking-wider">
                6-Stage Pipeline
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Guarded role-based Kanban pipeline with time tracking and bandwidth balancing
            </p>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2.5">
          {/* Closed Archive Toggle */}
          <button
            onClick={() => setShowClosedArchive(prev => !prev)}
            className={`text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition border cursor-pointer ${
              showClosedArchive
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
            }`}
          >
            <Archive size={14} />
            <span>{showClosedArchive ? 'Return to Board' : 'Closed Archive'}</span>
          </button>

          {/* "+ New Filing" Button for SUPER_ADMIN */}
          {isSuperAdmin && (
            <button
              onClick={() => setShowNewFilingModal(true)}
              className="glass-button text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            >
              <Plus size={15} />
              <span>+ New Filing</span>
            </button>
          )}
        </div>
      </div>

      {/* Toolbar: Search & Filters */}
      <div className="p-3.5 rounded-2xl bg-[#080d26]/80 border border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        {/* Left: Search Bar */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search code, assignee, auditor, type..."
            className="w-full glass-input text-xs pl-9 py-2"
          />
        </div>

        {/* Right: Dropdown Filters & Scope Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Toggle: My Codes vs All Codes */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setViewScope('MY')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewScope === 'MY'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My Codes
            </button>
            <button
              onClick={() => setViewScope('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewScope === 'ALL'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Codes
            </button>
          </div>

          {/* Person Filter */}
          <select
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            className="glass-input text-xs py-1.5 px-3 bg-[#0a153a] cursor-pointer"
          >
            <option value="ALL">All Team Members</option>
            {allEmployees.map(m => (
              <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                {m.name}
              </option>
            ))}
          </select>

          {/* Filing Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="glass-input text-xs py-1.5 px-3 bg-[#0a153a] cursor-pointer"
          >
            <option value="ALL">All Types</option>
            {filingTypes.map(t => (
              <option key={t} value={t} className="bg-[#0a153a] text-white">
                {t}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="glass-input text-xs py-1.5 px-3 bg-[#0a153a] cursor-pointer"
          >
            <option value="ALL">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Main Kanban Columns Container */}
      <div className="flex-1 overflow-x-auto custom-scrollbar pb-6">
        <PatentKanbanBoard
          filings={filteredFilings}
          onCardClick={(filing) => setSelectedFiling(filing)}
          currentUser={currentUser}
          userRoles={userRoles}
          viewScope={viewScope}
          showClosedArchive={showClosedArchive}
        />
      </div>

      {/* "+ New Filing" Modal */}
      <NewFilingModal
        isOpen={showNewFilingModal}
        onClose={() => setShowNewFilingModal(false)}
        onSubmit={handleCreateFiling}
        allMembers={allEmployees}
        filings={filings}
        patentRoleRecords={patentRoleRecords}
      />

      {/* Detail Slide-Over Drawer */}
      <PatentDetailDrawer
        filing={selectedFiling}
        isOpen={Boolean(selectedFiling)}
        onClose={() => setSelectedFiling(null)}
        currentUser={currentUser}
        userRoles={userRoles}
        allMembers={allEmployees}
        patentRoleRecords={patentRoleRecords}
        onTransition={handleTransition}
        onReassign={handleReassign}
      />
    </div>
  );
}
