// src/PatentFiling/NewFilingModal.jsx
// "+ New Filing" creation modal for SUPER_ADMIN

import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Clock, Calendar, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { PATENT_ROLES } from '../patent/patentStateMachine.js';
import {
  filterMembersByPatentRole,
  fetchAllPatentRoleRecords
} from '../patent/patentRoles.js';

const DEFAULT_FILING_TYPES = [
  'Provisional',
  'Non-Provisional',
  'PCT International',
  'Design Patent',
  'Convention Application',
  'National Phase'
];

export default function NewFilingModal({
  isOpen,
  onClose,
  onSubmit,
  allMembers = [],
  filings = [],
  patentRoleRecords = null
}) {
  const [code, setCode] = useState('');
  const [filingType, setFilingType] = useState('Provisional');
  const [assigneeId, setAssigneeId] = useState('');
  const [auditorId, setAuditorId] = useState('');
  const [estFilingHours, setEstFilingHours] = useState('4');
  const [estFilingMins, setEstFilingMins] = useState('0');
  const [estAuditHours, setEstAuditHours] = useState('1');
  const [estAuditMins, setEstAuditMins] = useState('0');
  const [hardDeadline, setHardDeadline] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveRoleRecords, setLiveRoleRecords] = useState(patentRoleRecords);

  // Fetch latest role records when modal opens if not provided
  useEffect(() => {
    if (isOpen && !patentRoleRecords) {
      fetchAllPatentRoleRecords().then(records => {
        if (records) setLiveRoleRecords(records);
      });
    }
  }, [isOpen, patentRoleRecords]);

  // Reset form when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setFilingType('Provisional');
      setAssigneeId('');
      setAuditorId('');
      setEstFilingHours('4');
      setEstFilingMins('0');
      setEstAuditHours('1');
      setEstAuditMins('0');
      setHardDeadline('');
      setPriority('Medium');
      setError('');
    }
  }, [isOpen]);

  // Calculate each member's current open workload
  const memberLoadMap = useMemo(() => {
    const map = {};
    allMembers.forEach(m => {
      const activeAssigned = filings.filter(f => String(f.assignee_id) === String(m.id) && f.status !== 'CLOSED');
      const activeAudited = filings.filter(f => String(f.auditor_id) === String(m.id) && f.status !== 'CLOSED');
      const totalMinutes = activeAssigned.reduce((acc, f) => acc + (f.est_filing_minutes || 0), 0) +
                           activeAudited.reduce((acc, f) => acc + (f.est_audit_minutes || 0), 0);
      map[m.id] = {
        count: activeAssigned.length + activeAudited.length,
        hours: (totalMinutes / 60).toFixed(1)
      };
    });
    return map;
  }, [allMembers, filings]);

  // Filter members strictly by role membership (data-driven)
  const assigneeCandidates = useMemo(() => {
    const list = filterMembersByPatentRole(allMembers, PATENT_ROLES.ASSIGNEE, liveRoleRecords);
    return [...list].sort((a, b) => {
      const loadA = Number(memberLoadMap[a.id]?.hours || 0);
      const loadB = Number(memberLoadMap[b.id]?.hours || 0);
      return loadA - loadB; // least-loaded first
    });
  }, [allMembers, liveRoleRecords, memberLoadMap]);

  const auditorCandidates = useMemo(() => {
    const list = filterMembersByPatentRole(allMembers, PATENT_ROLES.AUDITOR, liveRoleRecords);
    return [...list].sort((a, b) => {
      const loadA = Number(memberLoadMap[a.id]?.hours || 0);
      const loadB = Number(memberLoadMap[b.id]?.hours || 0);
      return loadA - loadB; // least-loaded first
    });
  }, [allMembers, liveRoleRecords, memberLoadMap]);

  if (!isOpen) return null;

  // Handle Assignee change: exclude from Auditor and check conflict
  const handleAssigneeChange = (newAssignee) => {
    if (auditorId && String(auditorId) === String(newAssignee)) {
      setAuditorId('');
      setError('Assignee and auditor must be different.');
    } else if (error === 'Assignee and auditor must be different.') {
      setError('');
    }
    setAssigneeId(newAssignee);
  };

  // Handle Auditor change: exclude from Assignee and check conflict
  const handleAuditorChange = (newAuditor) => {
    if (assigneeId && String(assigneeId) === String(newAuditor)) {
      setAssigneeId('');
      setError('Assignee and auditor must be different.');
    } else if (error === 'Assignee and auditor must be different.') {
      setError('');
    }
    setAuditorId(newAuditor);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter a unique filing code (e.g. PAT-2026-001).');
      return;
    }

    if (!assigneeId) {
      setError('Please select an Assignee.');
      return;
    }

    if (!auditorId) {
      setError('Please select an Auditor.');
      return;
    }

    // Assignee != Auditor validation
    if (String(assigneeId) === String(auditorId)) {
      setError('Assignee and auditor must be different.');
      return;
    }

    const estFilingMinutes = (Number(estFilingHours) || 0) * 60 + (Number(estFilingMins) || 0);
    const estAuditMinutes = (Number(estAuditHours) || 0) * 60 + (Number(estAuditMins) || 0);

    const filingData = {
      code: cleanCode,
      filing_type: filingType,
      assignee_id: assigneeId,
      auditor_id: auditorId,
      est_filing_minutes: estFilingMinutes,
      est_audit_minutes: estAuditMinutes,
      hard_deadline: hardDeadline || null,
      priority
    };

    setIsSubmitting(true);
    try {
      const res = await onSubmit(filingData);
      if (res && res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create filing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#070e28] border border-white/15 rounded-3xl p-6 md:p-8 shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Create Patent Filing</h2>
              <p className="text-xs text-slate-400">Initialize a new filing code into the workflow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Row 1: Code + Filing Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Filing Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="e.g. PAT-2026-001"
                className="w-full glass-input text-xs font-mono font-bold uppercase tracking-wider"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Filing Type <span className="text-red-400">*</span>
              </label>
              <select
                value={filingType}
                onChange={e => setFilingType(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a]"
              >
                {DEFAULT_FILING_TYPES.map(type => (
                  <option key={type} value={type} className="bg-[#0a153a] text-white">
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Assignee & Auditor (Role-driven, least-loaded first, mutually exclusive) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Assignee (Filer) <span className="text-red-400">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => handleAssigneeChange(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a]"
                required
              >
                <option value="">Select Assignee...</option>
                {assigneeCandidates
                  .filter(m => String(m.id) !== String(auditorId)) // Mutual exclusion: exclude selected Auditor
                  .map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                      {m.name} ({memberLoadMap[m.id]?.hours}h load)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Auditor (Reviewer) <span className="text-red-400">*</span>
              </label>
              <select
                value={auditorId}
                onChange={e => handleAuditorChange(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a]"
                required
              >
                <option value="">Select Auditor...</option>
                {auditorCandidates
                  .filter(m => String(m.id) !== String(assigneeId)) // Mutual exclusion: exclude selected Assignee
                  .map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                      {m.name} ({memberLoadMap[m.id]?.hours}h load)
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Row 3: Estimated Times (Hours + Minutes) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Est. Filing Time (hh:mm)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={estFilingHours}
                  onChange={e => setEstFilingHours(e.target.value)}
                  className="w-16 glass-input text-xs text-center"
                />
                <span className="text-xs text-slate-400">hrs</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={estFilingMins}
                  onChange={e => setEstFilingMins(e.target.value)}
                  className="w-16 glass-input text-xs text-center"
                />
                <span className="text-xs text-slate-400">mins</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Est. Audit Time (hh:mm)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={estAuditHours}
                  onChange={e => setEstAuditHours(e.target.value)}
                  className="w-16 glass-input text-xs text-center"
                />
                <span className="text-xs text-slate-400">hrs</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={estAuditMins}
                  onChange={e => setEstAuditMins(e.target.value)}
                  className="w-16 glass-input text-xs text-center"
                />
                <span className="text-xs text-slate-400">mins</span>
              </div>
            </div>
          </div>

          {/* Row 4: Hard Deadline & Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Statutory / Client Hard Deadline
              </label>
              <input
                type="date"
                value={hardDeadline}
                onChange={e => setHardDeadline(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a]"
              >
                <option value="Low" className="bg-[#0a153a] text-white">Low</option>
                <option value="Medium" className="bg-[#0a153a] text-white">Medium</option>
                <option value="High" className="bg-[#0a153a] text-white">High</option>
                <option value="Urgent" className="bg-[#0a153a] text-white">Urgent</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="glass-button text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : '+ Create Filing Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
