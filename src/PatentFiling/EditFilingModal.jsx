// src/PatentFiling/EditFilingModal.jsx
// Full card editing modal for SUPER_ADMIN (Mounisha)
// Allows updating filing parameters while preserving untouched data and maintaining audit history.

import { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, Edit3, CheckCircle2 } from 'lucide-react';
import { PATENT_ROLES, PATENT_STATUSES } from '../patent/patentStateMachine.js';
import {
  filterMembersByPatentRole,
  fetchAllPatentRoleRecords,
  getCanonicalMemberUuid
} from '../patent/patentRoles.js';

export default function EditFilingModal({
  isOpen,
  onClose,
  onSubmit,
  filing,
  allMembers = [],
  patentRoleRecords = null,
  existingFilingTypes = []
}) {
  const [code, setCode] = useState('');
  const [filingType, setFilingType] = useState('');
  const [tempCode, setTempCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [auditorId, setAuditorId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState(PATENT_STATUSES.ASSIGNED);
  const [estFilingHours, setEstFilingHours] = useState('4');
  const [estFilingMins, setEstFilingMins] = useState('0');
  const [estAuditHours, setEstAuditHours] = useState('1');
  const [estAuditMins, setEstAuditMins] = useState('0');
  const [hardDeadline, setHardDeadline] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveRoleRecords, setLiveRoleRecords] = useState(patentRoleRecords);

  // Populate state whenever filing or modal opens
  useEffect(() => {
    if (filing && isOpen) {
      setCode(filing.code || '');
      setFilingType(filing.filing_type || '');
      setTempCode(filing.temp_code || '');
      setTitle(filing.title || '');
      setDescription(filing.description || '');
      setAssigneeId(filing.assignee_id || '');
      setAuditorId(filing.auditor_id || '');
      setPriority(filing.priority || 'Medium');
      setStatus(filing.status || PATENT_STATUSES.ASSIGNED);

      const totalFiling = filing.est_filing_minutes || 0;
      setEstFilingHours(Math.floor(totalFiling / 60).toString());
      setEstFilingMins((totalFiling % 60).toString());

      const totalAudit = filing.est_audit_minutes || 0;
      setEstAuditHours(Math.floor(totalAudit / 60).toString());
      setEstAuditMins((totalAudit % 60).toString());

      setHardDeadline(filing.hard_deadline || '');
      setPaymentRef(filing.payment_reference || '');
      setReason('');
      setError('');
    }
  }, [filing, isOpen]);

  // Fetch latest role records if not passed
  useEffect(() => {
    if (isOpen && !patentRoleRecords) {
      fetchAllPatentRoleRecords().then(records => {
        if (records) setLiveRoleRecords(records);
      });
    }
  }, [isOpen, patentRoleRecords]);

  // Helper to determine if two IDs represent the same canonical member
  const isSamePerson = (idA, idB) => {
    if (!idA || !idB) return false;
    if (String(idA) === String(idB)) return true;
    const cA = getCanonicalMemberUuid({ id: idA });
    const cB = getCanonicalMemberUuid({ id: idB });
    return Boolean(cA && cB && cA.toLowerCase() === cB.toLowerCase());
  };

  const assigneeCandidates = useMemo(() => {
    return filterMembersByPatentRole(allMembers, PATENT_ROLES.ASSIGNEE, liveRoleRecords);
  }, [allMembers, liveRoleRecords]);

  const auditorCandidates = useMemo(() => {
    return filterMembersByPatentRole(allMembers, PATENT_ROLES.AUDITOR, liveRoleRecords);
  }, [allMembers, liveRoleRecords]);

  if (!isOpen || !filing) return null;

  const handleAssigneeChange = (newAssignee) => {
    if (auditorId && isSamePerson(auditorId, newAssignee)) {
      setAuditorId('');
      setError('Assignee and auditor must be different.');
    } else if (error === 'Assignee and auditor must be different.') {
      setError('');
    }
    setAssigneeId(newAssignee);
  };

  const handleAuditorChange = (newAuditor) => {
    if (assigneeId && isSamePerson(assigneeId, newAuditor)) {
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
      setError('Filing code is required.');
      return;
    }

    const cleanFilingType = filingType.trim();
    if (!cleanFilingType) {
      setError('Filing type is required.');
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

    if (isSamePerson(assigneeId, auditorId)) {
      setError('Assignee and auditor must be different.');
      return;
    }

    const estFilingMinutes = (Number(estFilingHours) || 0) * 60 + (Number(estFilingMins) || 0);
    const estAuditMinutes = (Number(estAuditHours) || 0) * 60 + (Number(estAuditMins) || 0);

    const updates = {
      code: cleanCode,
      filing_type: cleanFilingType,
      temp_code: tempCode.trim() || null,
      title: title.trim() || null,
      description: description.trim() || null,
      assignee_id: assigneeId,
      auditor_id: auditorId,
      priority,
      status,
      est_filing_minutes: estFilingMinutes,
      est_audit_minutes: estAuditMinutes,
      hard_deadline: hardDeadline || null,
      payment_reference: paymentRef.trim() || null,
      reason: reason.trim() || null
    };

    setIsSubmitting(true);
    try {
      const res = await onSubmit(updates);
      if (res && res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to update filing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#070e28] border border-white/15 rounded-3xl p-6 md:p-7 shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center">
              <Edit3 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Edit Patent Filing</h2>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {filing.code}
                </span>
              </div>
              <p className="text-xs text-slate-400">Super Admin Override — Update card details and parameters</p>
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
              <input
                type="text"
                value={filingType}
                onChange={e => setFilingType(e.target.value)}
                placeholder="e.g. Provisional, PCT, Design..."
                list="edit-filing-type-suggestions"
                className="w-full glass-input text-xs font-semibold"
                required
              />
              <datalist id="edit-filing-type-suggestions">
                {existingFilingTypes.map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Row 2: Temp Code + Title */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-purple-300 mb-1.5">
                Application Temp Code (Optional)
              </label>
              <input
                type="text"
                value={tempCode}
                onChange={e => setTempCode(e.target.value)}
                placeholder="e.g. TEMP-2026-001 or 202641012345"
                className="w-full glass-input text-xs font-mono font-bold text-purple-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Title / Matter Reference (Optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Autonomous Robotic Navigation System"
                className="w-full glass-input text-xs"
              />
            </div>
          </div>

          {/* Row 3: Assignee + Auditor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Assignee (Filer) <span className="text-red-400">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => handleAssigneeChange(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a] text-slate-100"
                style={{ colorScheme: 'dark' }}
                required
              >
                <option value="" className="bg-[#0a153a] text-white">Select Assignee...</option>
                {assigneeCandidates
                  .filter(m => !isSamePerson(m.id, auditorId))
                  .map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                      {m.name}
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
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a] text-slate-100"
                style={{ colorScheme: 'dark' }}
                required
              >
                <option value="" className="bg-[#0a153a] text-white">Select Auditor...</option>
                {auditorCandidates
                  .filter(m => !isSamePerson(m.id, assigneeId))
                  .map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                      {m.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Row 4: Priority + Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a] text-slate-100"
                style={{ colorScheme: 'dark' }}
              >
                <option value="Low" className="bg-[#0a153a] text-white">Low</option>
                <option value="Medium" className="bg-[#0a153a] text-white">Medium</option>
                <option value="High" className="bg-[#0a153a] text-white">High</option>
                <option value="Urgent" className="bg-[#0a153a] text-white">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Current Pipeline Stage
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full glass-input text-xs cursor-pointer bg-[#0a153a] text-slate-100 font-bold"
                style={{ colorScheme: 'dark' }}
              >
                {Object.values(PATENT_STATUSES).map(s => (
                  <option key={s} value={s} className="bg-[#0a153a] text-white">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 5: Estimated Times */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Est. Filing Time (Hours & Mins)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={estFilingHours}
                  onChange={e => setEstFilingHours(e.target.value)}
                  placeholder="Hours"
                  className="glass-input text-xs text-center"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="5"
                  value={estFilingMins}
                  onChange={e => setEstFilingMins(e.target.value)}
                  placeholder="Mins"
                  className="glass-input text-xs text-center"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Est. Audit Time (Hours & Mins)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={estAuditHours}
                  onChange={e => setEstAuditHours(e.target.value)}
                  placeholder="Hours"
                  className="glass-input text-xs text-center"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="5"
                  value={estAuditMins}
                  onChange={e => setEstAuditMins(e.target.value)}
                  placeholder="Mins"
                  className="glass-input text-xs text-center"
                />
              </div>
            </div>
          </div>

          {/* Row 6: Hard Deadline + Payment Reference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Hard Deadline (Optional)
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
                Payment Reference (Optional)
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={e => setPaymentRef(e.target.value)}
                placeholder="e.g. IPO-CH-2026-99214 or Bank UTR"
                className="w-full glass-input text-xs font-mono font-bold"
              />
            </div>
          </div>

          {/* Row 7: Description / Particulars */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Description / Matter Particulars (Optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add summary, client instructions, or specific notes..."
              rows={2}
              className="w-full glass-input text-xs"
            />
          </div>

          {/* Row 8: Admin Note / Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Reason / Admin Audit Note (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Updated deadline and assigned filer per client update"
              className="w-full glass-input text-xs text-slate-300 placeholder:text-slate-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="glass-button text-xs font-bold py-2 px-5 rounded-xl flex items-center gap-1.5 cursor-pointer bg-brand-600 hover:bg-brand-500 disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              <span>{isSubmitting ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
