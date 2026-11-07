// src/PatentFiling/PatentFilingDashboard.jsx
// Main container and toolbar for the Patent Filing Workflow

import { useState, useEffect, useMemo } from 'react';
import {
  ListTodo,
  FileSpreadsheet,
  Plus,
  Search,
  Archive,
  CheckCircle2,
  AlertCircle,
  X,
  User,
  Layers
} from 'lucide-react';
import { PATENT_ROLES, hasPatentRole } from '../patent/patentStateMachine.js';
import { fetchAllPatentRoleRecords, isMemberMatch, isRealHumanTeamMember, getCleanMemberName } from '../patent/patentRoles.js';
import PatentKanbanBoard from './PatentKanbanBoard.jsx';
import PatentDetailDrawer from './PatentDetailDrawer.jsx';
import NewFilingModal from './NewFilingModal.jsx';
import NewMiscTaskModal from './NewMiscTaskModal.jsx';
import EditFilingModal from './EditFilingModal.jsx';
import {
  loadFilingsFromStorage,
  saveNewFilingToStorage,
  executeTransitionInStorage,
  executeReassignInStorage,
  fetchSystemFilingTypes,
  updateFilingTypeInStorage,
  deleteFilingFromStorage,
  updateFilingInStorage,
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
  const [dateFilter, setDateFilter] = useState('ALL');
  const [customDate, setCustomDate] = useState('');
  const [codeScopeFilter, setCodeScopeFilter] = useState('ALL');
  const [showClosedArchive, setShowClosedArchive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTED');

  // Modals & Drawers
  const [showNewFilingModal, setShowNewFilingModal] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [editingFiling, setEditingFiling] = useState(null);
  const [selectedFiling, setSelectedFiling] = useState(null);
  const [notification, setNotification] = useState(null);
  const [patentRoleRecords, setPatentRoleRecords] = useState(null);

  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN) ||
    (currentUser?.name && currentUser.name.toLowerCase().includes('mounisha')) ||
    (currentUser?.role && ['admin', 'super admin'].includes(currentUser.role.toLowerCase()));

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
        const isActor = payload.actorId && isMemberMatch(currentUser.id, currentUser.name, payload.actorId);
        if (payload.actorId && !isActor) {
          const isMisc = incomingFiling.is_misc || incomingFiling.status === 'MISC' || incomingFiling.filing_type === 'MISC';
          let msg = isMisc ? `Task ${incomingFiling.code} updated.` : `Filing ${incomingFiling.code} updated.`;
          if (payload.action === 'CREATE') {
            msg = isMisc
              ? `New task ${incomingFiling.code} ("${incomingFiling.task_title || incomingFiling.title || ''}") assigned to you!`
              : `New filing ${incomingFiling.code} assigned to you!`;
          } else if (payload.action === 'REASSIGN') {
            msg = isMisc ? `Task ${incomingFiling.code} reassigned.` : `Filing ${incomingFiling.code} reassigned.`;
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
            msg = isMisc
              ? `Task ${incomingFiling.code} completed and closed!`
              : `Filing ${incomingFiling.code} closed.`;
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

  // Clean, human-only team members (filters out board columns, tool modules, queries, bots, and task buckets)
  const cleanTeamMembers = useMemo(() => {
    const membersMap = new Map();

    // 1. Add all real human employees from allEmployees
    (allEmployees || []).filter(isRealHumanTeamMember).forEach(emp => {
      const canonicalName = getCleanMemberName(emp) || (emp.name || '').trim();
      const lower = canonicalName.toLowerCase();
      if (!membersMap.has(lower)) {
        membersMap.set(lower, {
          id: emp.id,
          name: canonicalName
        });
      }
    });

    // 2. Also ensure any real staff assigned to or auditing active filings is included
    (filings || []).forEach(f => {
      if (f.assignee_name && isRealHumanTeamMember(f.assignee_name)) {
        const cName = f.assignee_name.trim();
        const lower = cName.toLowerCase();
        if (!membersMap.has(lower)) {
          membersMap.set(lower, {
            id: f.assignee_id || cName,
            name: cName
          });
        }
      }
      if (f.auditor_name && isRealHumanTeamMember(f.auditor_name)) {
        const cName = f.auditor_name.trim();
        const lower = cName.toLowerCase();
        if (!membersMap.has(lower)) {
          membersMap.set(lower, {
            id: f.auditor_id || cName,
            name: cName
          });
        }
      }
    });

    return Array.from(membersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, filings]);

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

      // Person filter (robust matching by UUID, agent ID, and canonical name)
      if (personFilter !== 'ALL') {
        const selectedMember = cleanTeamMembers.find(m => String(m.id) === String(personFilter));
        const personFilterName = selectedMember ? selectedMember.name : personFilter;
        const isAssignee = isMemberMatch(personFilter, personFilterName, f.assignee_id, f.assignee_name);
        const isAuditor = isMemberMatch(personFilter, personFilterName, f.auditor_id, f.auditor_name);
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

      // Date / Deadline filter
      if (dateFilter !== 'ALL') {
        const todayStr = new Date().toISOString().split('T')[0];
        const fDeadline = f.hard_deadline ? String(f.hard_deadline).split('T')[0].trim() : null;
        const fCreated = f.created_at ? String(f.created_at).split('T')[0].trim() : null;
        const fUpdated = f.updated_at ? String(f.updated_at).split('T')[0].trim() : null;
        const fEffective = fDeadline || fCreated || fUpdated;

        if (dateFilter === 'TODAY') {
          const isToday = fDeadline ? fDeadline === todayStr : fEffective === todayStr;
          if (!isToday) return false;
        } else if (dateFilter === 'OVERDUE') {
          if (!fDeadline || fDeadline >= todayStr || f.status === 'CLOSED') {
            return false;
          }
        } else if (dateFilter === 'NEXT_2_DAYS') {
          if (!fDeadline) return false;
          const diffDays = Math.round((new Date(fDeadline).getTime() - new Date(todayStr).getTime()) / 86400000);
          if (diffDays < 0 || diffDays > 2) return false;
        } else if (dateFilter === 'NEXT_7_DAYS') {
          if (!fDeadline) return false;
          const diffDays = Math.round((new Date(fDeadline).getTime() - new Date(todayStr).getTime()) / 86400000);
          if (diffDays < 0 || diffDays > 7) return false;
        } else if (dateFilter === 'NEXT_30_DAYS') {
          if (!fDeadline) return false;
          const diffDays = Math.round((new Date(fDeadline).getTime() - new Date(todayStr).getTime()) / 86400000);
          if (diffDays < 0 || diffDays > 30) return false;
        } else if (dateFilter === 'SPECIFIC') {
          if (customDate) {
            const target = customDate.trim();
            const matches = (fDeadline && fDeadline === target) || (fEffective && fEffective === target);
            if (!matches) return false;
          }
        }
      }

      return true;
    });
  }, [filings, searchQuery, personFilter, typeFilter, priorityFilter, dateFilter, customDate, cleanTeamMembers]);

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

  // Super Admin Edit Filing handler with Optimistic UI & Rollback
  const handleUpdateFiling = async (filingToUpdate, updates) => {
    if (!filingToUpdate) return;
    const originalFilings = filings;
    const originalSelected = selectedFiling;

    // 1. Optimistic UI update
    const optimisticFiling = {
      ...filingToUpdate,
      ...updates,
      version: (filingToUpdate.version || 1) + 1,
      updated_at: new Date().toISOString()
    };
    setFilings(prev => prev.map(f => f.id === filingToUpdate.id ? optimisticFiling : f));
    if (selectedFiling?.id === filingToUpdate.id) {
      setSelectedFiling(optimisticFiling);
    }

    // 2. Persist to storage & database
    const res = await updateFilingInStorage({
      filing: filingToUpdate,
      updates,
      actor: currentUser,
      actorRoles: userRoles,
      allMembers: allEmployees
    });

    if (res.success) {
      setFilings(prev => prev.map(f => f.id === res.filing.id ? res.filing : f));
      if (selectedFiling?.id === res.filing.id) {
        setSelectedFiling(res.filing);
      }
      setNotification({
        type: 'success',
        message: `Filing ${res.filing.code} details successfully updated!`
      });
      return { success: true, filing: res.filing };
    } else {
      // 3. Rollback on failure
      setFilings(originalFilings);
      if (originalSelected?.id === filingToUpdate.id) {
        setSelectedFiling(originalSelected);
      }
      setNotification({
        type: 'error',
        message: res.error || 'Failed to update filing details.'
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

  // Quick Done handler for MISC tasks
  const handleQuickDone = async (filing) => {
    if (!filing) return;
    const originalFilings = filings;
    const originalSelected = selectedFiling;
    const optimisticFiling = {
      ...filing,
      status: PATENT_STATUSES.CLOSED,
      version: (filing.version || 1) + 1,
      updated_at: new Date().toISOString()
    };
    setFilings(prev => prev.map(f => f.id === filing.id ? optimisticFiling : f));
    if (selectedFiling?.id === filing.id) {
      setSelectedFiling(optimisticFiling);
    }
    const res = await executeTransitionInStorage({
      filing,
      toStatus: PATENT_STATUSES.CLOSED,
      actor: currentUser,
      actorRoles: userRoles,
      note: 'Task marked as completed',
      payload: {},
      allMembers: allEmployees
    });
    if (res.success) {
      setFilings(prev => prev.map(f => f.id === res.filing.id ? { ...f, ...res.filing } : f));
      if (selectedFiling?.id === res.filing.id) {
        setSelectedFiling(res.filing);
      }
      setNotification({
        type: 'success',
        message: `Task ${filing.code} (${filing.task_title || filing.title || 'Task'}) marked as Completed!`
      });
    } else {
      setFilings(originalFilings);
      if (originalSelected?.id === filing.id) {
        setSelectedFiling(originalSelected);
      }
      setNotification({
        type: 'error',
        message: res.error || 'Failed to complete task.'
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
                Workflow Pipeline
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

          {/* Action Buttons for Super Admin Mounisha: + New Filing & + New Task */}
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewFilingModal(true)}
                className="glass-button text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                title="Create a new patent filing"
              >
                <Plus size={15} />
                <span>+ New Filing</span>
              </button>
              <button
                onClick={() => setShowNewTaskModal(true)}
                className="glass-button text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.4)]"
                title="Assign a miscellaneous standalone task directly to anyone"
              >
                <ListTodo size={15} />
                <span>+ New Task</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar: Search & Filters */}
      <div className="p-3.5 rounded-2xl bg-[#080d26]/80 border border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        {/* Left: Search Bar */}
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search code, assignee, auditor, temp code, description, corrections..."
            className="w-full glass-input glass-input-search text-xs pr-8 py-2"
            style={{ paddingLeft: '2.5rem' }}
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

        {/* Middle: Toggle Switch (My Codes vs All Codes) */}
        <div className="flex items-center bg-[#050920] p-1 rounded-xl border border-white/10 shadow-inner shrink-0">
          <button
            type="button"
            onClick={() => setCodeScopeFilter('MINE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              codeScopeFilter === 'MINE'
                ? 'bg-brand-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User size={13} />
            <span>My Codes</span>
          </button>
          <button
            type="button"
            onClick={() => setCodeScopeFilter('ALL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              codeScopeFilter === 'ALL'
                ? 'bg-brand-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers size={13} />
            <span>All Codes</span>
          </button>
        </div>

        {/* Right: Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Person Filter */}
          <select
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            className="glass-input text-xs py-1.5 px-3 bg-[#0a153a] text-slate-100 cursor-pointer min-w-[140px]"
            style={{ colorScheme: 'dark' }}
          >
            <option value="ALL" className="bg-[#0a153a] text-white">All Team Members</option>
            {cleanTeamMembers.map(m => (
              <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                {m.name}
              </option>
            ))}
          </select>

          {/* Filing Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="glass-input text-xs py-1.5 px-3 bg-[#0a153a] text-slate-100 cursor-pointer min-w-[110px]"
            style={{ colorScheme: 'dark' }}
          >
            <option value="ALL" className="bg-[#0a153a] text-white">All Types</option>
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
            className="glass-input text-xs py-1.5 px-3 bg-[#0a153a] text-slate-100 cursor-pointer min-w-[115px]"
            style={{ colorScheme: 'dark' }}
          >
            <option value="ALL" className="bg-[#0a153a] text-white">All Priorities</option>
            <option value="Urgent" className="bg-[#0a153a] text-white">Urgent</option>
            <option value="High" className="bg-[#0a153a] text-white">High</option>
            <option value="Medium" className="bg-[#0a153a] text-white">Medium</option>
            <option value="Low" className="bg-[#0a153a] text-white">Low</option>
          </select>

          {/* Date Filter (Beside All Priorities) */}
          <select
            value={dateFilter}
            onChange={e => {
              setDateFilter(e.target.value);
              if (e.target.value !== 'SPECIFIC') setCustomDate('');
            }}
            className={`glass-input text-xs py-1.5 px-3 bg-[#0a153a] text-slate-100 cursor-pointer min-w-[115px] transition-all ${
              dateFilter !== 'ALL' ? 'border-brand-500 ring-1 ring-brand-500/50 text-brand-200 font-semibold' : ''
            }`}
            style={{ colorScheme: 'dark' }}
            title="Filter filings by date or deadline"
          >
            <option value="ALL" className="bg-[#0a153a] text-white">All Dates</option>
            <option value="TODAY" className="bg-[#0a153a] text-white">Due Today</option>
            <option value="OVERDUE" className="bg-[#0a153a] text-white">Overdue</option>
            <option value="NEXT_2_DAYS" className="bg-[#0a153a] text-white">Due in 1–2 Days</option>
            <option value="NEXT_7_DAYS" className="bg-[#0a153a] text-white">Due in 7 Days</option>
            <option value="NEXT_30_DAYS" className="bg-[#0a153a] text-white">Due in 30 Days</option>
            <option value="SPECIFIC" className="bg-[#0a153a] text-white">Specific Date…</option>
          </select>

          {/* Specific Date Picker Input */}
          {dateFilter === 'SPECIFIC' && (
            <div className="relative flex items-center animate-in fade-in zoom-in-95 duration-150">
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="glass-input text-xs py-1 px-2.5 bg-[#0a153a] text-slate-100 border-brand-500 ring-1 ring-brand-500/50 cursor-pointer rounded-lg"
                style={{ colorScheme: 'dark' }}
                title="Choose specific date"
              />
              {customDate && (
                <button
                  type="button"
                  onClick={() => setCustomDate('')}
                  className="ml-1 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  title="Clear date"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {/* Quick Clear All Filters button if any filter is active */}
          {(personFilter !== 'ALL' || typeFilter !== 'ALL' || priorityFilter !== 'ALL' || dateFilter !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setPersonFilter('ALL');
                setTypeFilter('ALL');
                setPriorityFilter('ALL');
                setDateFilter('ALL');
                setCustomDate('');
                setSearchQuery('');
              }}
              className="text-[11px] font-semibold text-slate-400 hover:text-rose-300 px-2 py-1 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer shrink-0"
              title="Reset all active filters"
            >
              Reset Filters
            </button>
          )}
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
          codeScopeFilter={codeScopeFilter}
          onDeleteFiling={handleDeleteFiling}
          onEditFiling={(filing) => setEditingFiling(filing)}
          onMarkDone={handleQuickDone}
        />
      </div>

      {/* "+ New Task" Modal (MISC Tasks) */}
      <NewMiscTaskModal
        isOpen={showNewTaskModal}
        onClose={() => setShowNewTaskModal(false)}
        onSubmit={handleCreateFiling}
        allMembers={allEmployees}
        filings={filings}
      />

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
        onEditFiling={(filing) => setEditingFiling(filing)}
      />

      {/* Super Admin Edit Filing Modal */}
      {editingFiling && (
        <EditFilingModal
          isOpen={Boolean(editingFiling)}
          filing={editingFiling}
          onClose={() => setEditingFiling(null)}
          onSubmit={async (updates) => {
            return await handleUpdateFiling(editingFiling, updates);
          }}
          allMembers={allEmployees}
          patentRoleRecords={patentRoleRecords}
          existingFilingTypes={filingTypes}
        />
      )}
    </div>
  );
}
