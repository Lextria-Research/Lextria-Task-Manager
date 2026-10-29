// src/PatentFiling/NewFilingModal.jsx
// "+ New Filing" creation modal for SUPER_ADMIN

import React, { useState } from 'react';
import { X, Plus, Clock, Calendar, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { validateFilingCreation, PATENT_ROLES } from '../patent/patentStateMachine.js';

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
  filings = []
}) {
  const [code, setCode] = useState('');
  const [filingType, setFilingType] = useState('Provisional');
  const [title, setTitle] = useState('');
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

  if (!isOpen) return null;

  // Calculate each member's current open load
  const memberLoadMap = {};
  allMembers.forEach(m => {
    const activeAssigned = filings.filter(f => String(f.assignee_id) === String(m.id) && f.status !== 'CLOSED');
    const activeAudited = filings.filter(f => String(f.auditor_id) === String(m.id) && f.status !== 'CLOSED');
    const totalMinutes = activeAssigned.reduce((acc, f) => acc + (f.est_filing_minutes || 0), 0) +
                         activeAudited.reduce((acc, f) => acc + (f.est_audit_minutes || 0), 0);
    memberLoadMap[m.id] = {
      count: activeAssigned.length + activeAudited.length,
      hours: (totalMinutes / 60).toFixed(1)
    };
  });

  // Sort members least-loaded first
  const sortedMembers = [...allMembers].sort((a, b) => {
    const loadA = Number(memberLoadMap[a.id]?.hours || 0);
    const loadB = Number(memberLoadMap[b.id]?.hours || 0);
    return loadA - loadB;
  });

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
      setError('Assignee and Auditor cannot be the same person.');
      return;
    }

    const estFilingMinutes = (Number(estFilingHours) || 0) * 60 + (Number(estFilingMins) || 0);
    const estAuditMinutes = (Number(estAuditHours) || 0) * 60 + (Number(estAuditMins) || 0);

    const filingData = {
      code: cleanCode,
      filing_type: filingType,
      title: title.trim(),
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
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

          {/* Title / Client Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Title / Client Invention Summary
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Optical Sensor Calibration for Micro-controllers"
              className="w-full glass-input text-xs"
            />
          </div>

          {/* Row 2: Assignee & Auditor (Sorted least-loaded first, Auditor excludes Assignee) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Assignee (Filer) <span className="text-red-400">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => {
                  setAssigneeId(e.target.value);
                  if (auditorId === e.target.value) setAuditorId('');
                }}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a]"
                required
              >
                <option value="">Select Assignee...</option>
                {sortedMembers.map(m => (
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
                onChange={e => setAuditorId(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a]"
                required
              >
                <option value="">Select Auditor...</option>
                {sortedMembers
                  .filter(m => String(m.id) !== String(assigneeId)) // exclude selected assignee!
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
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition"
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
