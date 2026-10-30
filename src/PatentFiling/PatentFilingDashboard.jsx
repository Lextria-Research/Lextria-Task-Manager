// src/PatentFiling/PatentFilingDashboard.jsx
// Main container and toolbar for the Patent Filing Workflow

import { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Archive,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { PATENT_ROLES, hasPatentRole } from '../patent/patentStateMachine.js';
import { fetchAllPatentRoleRecords, isMemberMatch } from '../patent/patentRoles.js';
import PatentKanbanBoard from './PatentKanbanBoard.jsx';
import PatentDetailDrawer from './PatentDetailDrawer.jsx';
import NewFilingModal from './NewFilingModal.jsx';
import {
  loadFilingsFromStorage,
  saveNewFilingToStorage,
  executeTransitionInStorage,
  executeReassignInStorage,
  fetchSystemFilingTypes,
  updateFilingTypeInStorage,
  deleteFilingFromStorage,
  matchFilingSearch,
  getLocalCache,
  LOCAL_ROUNDS_KEY,
  LOCAL_EVENTS_KEY
} from './patentStorage.js';
import { initPatentRealtimeSync } from './patentRealtime.js';

// Pre-existing fixed filing types that were removed in favor of manual entry
const REMOVED_PRE_EXISTING_TYPES = new Set([
  'Provisional',
  'Non-Provisional',
  'PCT International',
  'Design Patent',
  'Convention Application',
  'National Phase'
]);

export default function PatentFilingDashboard({
  currentUser,
  allEmployees = [],
  userRoles = [],
  targetOpenFilingId = null,
  onClearTargetFiling = null
}) {
  const [filings, setFilings] = useState([]);
  const [systemFilingTypes, setSystemFilingTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [personFilter, setPersonFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [showClosedArchive, setShowClosedArchive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTED');

  // Modals & Drawers
  const [showNewFilingModal, setShowNewFilingModal] = useState(false);
  const [selectedFiling, setSelectedFiling] = useState(null);
  const [notification, setNotification] = useState(null);
  const [patentRoleRecords, setPatentRoleRecords] = useState(null);

  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN);

  // Auto-dismiss toast notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Open filing detail drawer automatically when targeted (e.g. from notification click)
  useEffect(() => {
    if (targetOpenFilingId && filings.length > 0) {
      const targetStr = String(targetOpenFilingId).trim().toLowerCase();
      const match = filings.find(f =>
        String(f.id).toLowerCase() === targetStr ||
        (f.code && f.code.trim().toLowerCase() === targetStr)
      );
      if (match) {
        setSelectedFiling(match);
        if (onClearTargetFiling) onClearTargetFiling();
      }
    }
  }, [targetOpenFilingId, filings, onClearTargetFiling]);

  // Load filings and dynamic role records on mount
  useEffect(() => {
    async function init() {
      const [loaded, roles, types] = await Promise.all([
        loadFilingsFromStorage(allEmployees),
        fetchAllPatentRoleRecords(),
        fetchSystemFilingTypes()
      ]);
      setFilings(loaded);
      if (roles) setPatentRoleRecords(roles);
      if (types) setSystemFilingTypes(types);
    }
    init();
  }, [allEmployees]);

  // Real-time synchronization subscription
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;

    const destroy = initPatentRealtimeSync({
      currentUser,
      userRoles,
      onConnectionChange: (status) => {
        setConnectionStatus(status);
      },
      onRefetchNeeded: async () => {
        const updated = await loadFilingsFromStorage(allEmployees);
        setFilings(updated);
      },
      onFilingEvent: (payload) => {
        if (!payload) return;

        // If DELETE action
        if (payload.action === 'DELETE' && payload.filingId) {
          setFilings(prev => prev.filter(f => f.id !== payload.filingId));
          setSelectedFiling(prev => prev?.id === payload.filingId ? null : prev);
          return;
        }

        const incomingFiling = payload.filing;
        if (!incomingFiling || !incomingFiling.id) return;

        const isSuper = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN) ||
          (currentUser.role && currentUser.role.toLowerCase() === 'leader');
        const isInPaymentOrAck = ['PAYMENT', 'ACK', 'CLOSED'].includes(incomingFiling.status);
        const isAssignee = isMemberMatch(currentUser.id, currentUser.name, incomingFiling.assignee_id, incomingFiling.assignee_name);
        const isAuditor = isMemberMatch(currentUser.id, currentUser.name, incomingFiling.auditor_id, incomingFiling.auditor_name);

        const shouldRetain = isSuper || isInPaymentOrAck || isAssignee || isAuditor;

        setFilings(prev => {
          const existingIdx = prev.findIndex(f => f.id === incomingFiling.id);

          if (!shouldRetain) {
            // Card should disappear if reassigned away from this user
            return prev.filter(f => f.id !== incomingFiling.id);
          }

          if (existingIdx !== -1) {
            const existing = prev[existingIdx];
            // Ignore stale events
            if ((existing.version || 0) >= (incomingFiling.version || 0)) {
              return prev;
            }
            const next = [...prev];
            next[existingIdx] = { ...existing, ...incomingFiling };
            return next;
          } else {
            return [incomingFiling, ...prev];
          }
        });

        // Update system-wide filing types for all users
        if (incomingFiling.filing_type) {
          const t = incomingFiling.filing_type.trim();
          if (t && !REMOVED_PRE_EXISTING_TYPES.has(t)) {
            setSystemFilingTypes(prev => prev.includes(t) ? prev : [...prev, t]);
          }
        }

        // Update selected filing in detail drawer if open
        setSelectedFiling(prev => {
          if (prev && prev.id === incomingFiling.id) {
            if (shouldRetain) {
              return { ...prev, ...incomingFiling };
            } else {
              return null;
            }
          }
          return prev;
        });

        // Toast notification: Show when mutation was triggered by another user
        if (payload.actorId && String(payload.actorId) !== String(currentUser.id)) {
          let msg = `Filing ${incomingFiling.code} updated.`;
          if (payload.action === 'CREATE') {
            msg = `New filing ${incomingFiling.code} assigned to you!`;
          } else if (payload.action === 'REASSIGN') {
            msg = `Filing ${incomingFiling.code} reassigned.`;
          } else if (payload.action === 'UPDATE_TYPE') {
            msg = `Filing ${incomingFiling.code} type updated to "${incomingFiling.filing_type}".`;
          } else if (incomingFiling.status === 'AUDIT') {
            msg = `Filing ${incomingFiling.code} sent to Audit.`;
          } else if (incomingFiling.status === 'CORRECTION') {
            msg = `Filing ${incomingFiling.code} sent for Correction.`;
          } else if (incomingFiling.status === 'PAYMENT') {
            msg = `Filing ${incomingFiling.code} approved and moved to Payment.`;
          } else if (incomingFiling.status === 'ACK') {
            msg = `Filing ${incomingFiling.code} payment confirmed (Ack pending).`;
          } else if (incomingFiling.status === 'CLOSED') {
            msg = `Filing ${incomingFiling.code} closed.`;
          }

          setNotification({
            type: 'info',
            message: msg
          });
        }
      }
    });

    return () => {
      destroy();
    };
  }, [currentUser, userRoles, allEmployees]);

  // Unique manually entered filing types across the system (excluding the removed fixed list)
  const filingTypes = useMemo(() => {
    const set = new Set();
    filings.forEach(f => {
      if (f.filing_type && typeof f.filing_type === 'string') {
        const clean = f.filing_type.trim();
        if (clean && !REMOVED_PRE_EXISTING_TYPES.has(clean)) {
          set.add(clean);
        }
      }
    });
    systemFilingTypes.forEach(t => {
      if (t && typeof t === 'string') {
        const clean = t.trim();
        if (clean && !REMOVED_PRE_EXISTING_TYPES.has(clean)) {
          set.add(clean);
        }
      }
    });
    return Array.from(set).sort();
  }, [filings, systemFilingTypes]);

  // Filtered filings based on search & toolbar filters
  const filteredFilings = useMemo(() => {
    const localRounds = getLocalCache(LOCAL_ROUNDS_KEY, []);
    const localEvents = getLocalCache(LOCAL_EVENTS_KEY, []);

    return filings.filter(f => {
      // Deep search query across EVERYTHING inside the card (code, assignee, auditor, temp code, description, corrections, notes, etc.)
      if (searchQuery.trim()) {
        if (!matchFilingSearch(f, searchQuery, localRounds, localEvents)) {
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
      if (res.filing.filing_type) {
        const cleanType = res.filing.filing_type.trim();
        if (cleanType && !REMOVED_PRE_EXISTING_TYPES.has(cleanType)) {
          setSystemFilingTypes(prev => prev.includes(cleanType) ? prev : [...prev, cleanType]);
        }
      }
      setNotification({
        type: 'success',
        message: `Filing code "${res.filing.code}" successfully created and assigned!`
      });
      return { success: true };
    }
    return res;
  };

  // Update filing type handler
  const handleUpdateFilingType = async (newFilingType) => {
    if (!selectedFiling) return;
    const res = await updateFilingTypeInStorage({
      filing: selectedFiling,
      newFilingType,
      actor: currentUser,
      allMembers: allEmployees
    });

    if (res.success) {
      setFilings(prev => prev.map(f => f.id === res.filing.id ? { ...f, ...res.filing } : f));
      setSelectedFiling(prev => ({ ...prev, ...res.filing }));
      const cleanType = res.filing.filing_type.trim();
      if (cleanType && !REMOVED_PRE_EXISTING_TYPES.has(cleanType)) {
        setSystemFilingTypes(prev => prev.includes(cleanType) ? prev : [...prev, cleanType]);
      }
      setNotification({
        type: 'success',
        message: `Filing type updated to "${res.filing.filing_type}".`
      });
      return { success: true };
    }

    setNotification({
      type: 'error',
      message: res.error || 'Failed to update filing type.'
    });
    return res;
  };

  // State machine transition handler with Optimistic UI & Rollback
  const handleTransition = async (toStatus, payload = {}, note = '') => {
    if (!selectedFiling) return;
    const originalFilings = filings;
    const originalSelected = selectedFiling;

    // 1. Optimistic UI update: move card immediately
    const optimisticFiling = {
      ...selectedFiling,
      ...payload,
      status: toStatus,
      temp_code: payload.temp_code !== undefined ? payload.temp_code : selectedFiling.temp_code,
      version: (selectedFiling.version || 1) + 1,
      updated_at: new Date().toISOString()
    };
    setFilings(prev => prev.map(f => f.id === selectedFiling.id ? optimisticFiling : f));
    setSelectedFiling(optimisticFiling);

    // 2. Persist to storage & database
    const res = await executeTransitionInStorage({
      filing: selectedFiling,
      toStatus,
      actor: currentUser,
      actorRoles: userRoles,
      note,
      payload,
      allMembers: allEmployees
    });

    if (res.success) {
      setFilings(prev => prev.map(f => f.id === res.filing.id ? { ...f, ...res.filing } : f));
      setSelectedFiling(prev => ({ ...prev, ...res.filing }));
      setNotification({
        type: 'success',
        message: `Filing ${res.filing.code} moved to ${toStatus}.`
      });
      return { success: true };
    } else {
      // 3. Rollback on rejection or validation error
      setFilings(originalFilings);
      setSelectedFiling(originalSelected);
      setNotification({
        type: 'error',
        message: res.error || 'Failed to update filing status.'
      });
      return res;
    }
  };

  // Reassignment handler with Optimistic UI & Rollback
  const handleReassign = async (newAssigneeId, newAuditorId, reason) => {
    if (!selectedFiling) return;
    const originalFilings = filings;
    const originalSelected = selectedFiling;

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
    } else {
      // Rollback on rejection
      setFilings(originalFilings);
      setSelectedFiling(originalSelected);
      setNotification({
        type: 'error',
        message: res.error || 'Failed to reassign filing.'
      });
      return res;
    }
  };

  // Delete handler for Leaders with Optimistic UI & Rollback
  const handleDeleteFiling = async (filingToDelete) => {
    if (!filingToDelete || !filingToDelete.id) return;
    const fId = filingToDelete.id;
    const fCode = filingToDelete.code;

    const originalFilings = filings;
    const originalSelected = selectedFiling;

    // Optimistically remove from state
    setFilings(prev => prev.filter(f => f.id !== fId));
    if (selectedFiling?.id === fId) {
      setSelectedFiling(null);
    }

    const res = await deleteFilingFromStorage({
      filingId: fId,
      code: fCode,
      actor: currentUser,
      actorRoles: userRoles
    });

    if (res.success) {
      setNotification({
        type: 'success',
        message: `Filing ${fCode} has been deleted.`
      });
    } else {
      // Rollback on failure
      setFilings(originalFilings);
      setSelectedFiling(originalSelected);
      setNotification({
        type: 'error',
        message: res.error || 'Failed to delete filing.'
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-5 px-6 py-4 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-20 right-8 z-[70] p-4 rounded-2xl border text-white shadow-2xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ${
          notification.type === 'error'
            ? 'bg-rose-600/95 border-rose-400'
            : notification.type === 'info'
            ? 'bg-indigo-600/95 border-indigo-400'
            : 'bg-emerald-600/95 border-emerald-400'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
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
              {connectionStatus === 'RECONNECTING' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Reconnecting…
                </span>
              )}
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
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search code, assignee, auditor, temp code, description, corrections..."
            className="w-full glass-input text-xs pl-9 pr-8 py-2"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer transition p-1"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Right: Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
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
          showClosedArchive={showClosedArchive}
          onDeleteFiling={handleDeleteFiling}
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
        existingFilingTypes={filingTypes}
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
        onUpdateFilingType={handleUpdateFilingType}
        onDeleteFiling={handleDeleteFiling}
      />
    </div>
  );
}
