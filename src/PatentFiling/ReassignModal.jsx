// src/PatentFiling/ReassignModal.jsx
// Modal for SUPER_ADMIN to reassign assignee or auditor mid-flow with mandatory reason

import React, { useState } from 'react';
import { X, UserCheck, AlertCircle } from 'lucide-react';

export default function ReassignModal({
  isOpen,
  onClose,
  onSubmit,
  filing,
  allMembers = []
}) {
  const [newAssigneeId, setNewAssigneeId] = useState(filing?.assignee_id || '');
  const [newAuditorId, setNewAuditorId] = useState(filing?.auditor_id || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !filing) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('Reassignment reason is mandatory and will be logged in the permanent audit trail.');
      return;
    }

    if (String(newAssigneeId) === String(newAuditorId)) {
      setError('Assignee and Auditor cannot be the same person.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        newAssigneeId,
        newAuditorId,
        reason: cleanReason
      });

      if (res && res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to reassign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#070e28] border border-blue-500/30 rounded-3xl p-6 md:p-8 shadow-2xl text-slate-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Reassign Filing</h2>
              <p className="text-xs text-brand-300 font-mono">{filing.code}</p>
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
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Assignee (Filer)
            </label>
            <select
              value={newAssigneeId}
              onChange={e => setNewAssigneeId(e.target.value)}
              className="w-full glass-input text-xs bg-[#0a153a] cursor-pointer"
            >
              {allMembers.map(m => (
                <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Auditor (Reviewer)
            </label>
            <select
              value={newAuditorId}
              onChange={e => setNewAuditorId(e.target.value)}
              className="w-full glass-input text-xs bg-[#0a153a] cursor-pointer"
            >
              {allMembers
                .filter(m => String(m.id) !== String(newAssigneeId))
                .map(m => (
                  <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                    {m.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Mandatory Reassignment Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain reason for reassigning mid-flow (e.g. Leave of absence, domain specialization required)..."
              rows={3}
              className="w-full glass-input text-xs"
              required
            />
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
              className="glass-button text-xs font-bold px-5 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Confirm Reassignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
