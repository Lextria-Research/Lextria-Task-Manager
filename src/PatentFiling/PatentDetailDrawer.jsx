// src/PatentFiling/PatentDetailDrawer.jsx
// Slide-over detail drawer for Patent Filings with role-authorized action buttons,
// audit event timeline, and historical correction rounds with image lightbox.

import { useState, useEffect } from 'react';
import {
  ListTodo,
  X,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  CreditCard,
  MailCheck,
  ArrowRight,
  ShieldAlert,
  Trash2,
  Copy,
  Edit3,
  ArrowRightLeft
} from 'lucide-react';
import {
  PATENT_ROLES,
  PATENT_STATUSES,
  hasPatentRole
} from '../patent/patentStateMachine.js';
import { isLeaderOrSharan } from '../attachmentUtils.js';
import { getFilingEventsAndRounds, fetchFilingEventsAndRoundsFromDb } from './patentStorage.js';
import SendCorrectionModal from './SendCorrectionModal.jsx';
import ReassignModal from './ReassignModal.jsx';

function formatAuditDate(timestamp) {
  if (!timestamp) return '';
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestamp.trim())) {
    const [y, m, d] = timestamp.trim().split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function PatentDetailDrawer({
  filing,
  isOpen,
  onClose,
  currentUser,
  userRoles = [],
  allMembers = [],
  patentRoleRecords = null,
  onTransition,
  onReassign,
  onUpdateFilingType,
  onDeleteFiling,
  onEditFiling
}) {
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Transition form states
  const [tempCodeInput, setTempCodeInput] = useState('');
  const [filingNotesInput, setFilingNotesInput] = useState('');
  const [copiedTempCode, setCopiedTempCode] = useState(false);
  const [assigneeResponseNote, setAssigneeResponseNote] = useState('');
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [forceMoveStatus, setForceMoveStatus] = useState('');
  const [forceMoveReason, setForceMoveReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [isEditingType, setIsEditingType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState('');

  const [historyData, setHistoryData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (filing?.id) {
      setTempCodeInput(filing.temp_code || '');
      setFilingNotesInput('');
      setActionError('');
      fetchFilingEventsAndRoundsFromDb(filing.id, allMembers).then(res => {
        if (isMounted && res) {
          setHistoryData(res);
        }
      });
    }
    return () => { isMounted = false; };
  }, [filing?.id, filing?.version, filing?.temp_code, isOpen, allMembers]);

  if (!isOpen || !filing) return null;

  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN);
  const isLeader = isSuperAdmin ||
    (currentUser?.role && currentUser.role.toLowerCase() === 'leader') ||
    isLeaderOrSharan(currentUser);
  const isAssignee = String(filing.assignee_id) === String(currentUser?.id) ||
    (currentUser?.name && filing.assignee_name && filing.assignee_name.toLowerCase().includes(currentUser.name.toLowerCase()));
  const isAuditor = String(filing.auditor_id) === String(currentUser?.id) ||
    (currentUser?.name && filing.auditor_name && filing.auditor_name.toLowerCase().includes(currentUser.name.toLowerCase()));
  const isAckChecker = hasPatentRole(userRoles, PATENT_ROLES.ACK_CHECKER);

  // Multi-code parsing for clean pill rendering
  const rawCodes = (filing.code || '')
    .split(/[,;\s]+/)
    .map(c => c.trim())
    .filter(Boolean);
  const cleanCodes = rawCodes.length > 0 ? rawCodes : [filing.code || 'NO-CODE'];

  // Auditor takeover feature:
  // Current user is an auditor, is not currently assigned as auditor on this card, and is NOT the assignee
  const isAuditorUser = hasPatentRole(userRoles, PATENT_ROLES.AUDITOR) ||
    isLeader ||
    ['Prathvi', 'Chaitra', 'Kaushal', 'Karthik'].some(n =>
      currentUser?.name && currentUser.name.toLowerCase().includes(n.toLowerCase())
    );
  const isOtherAuditorCard = isAuditorUser && !isAuditor && !isAssignee;

  const fallbackData = getFilingEventsAndRounds(filing.id);
  const rawEvents = (historyData?.events && historyData.events.length > 0)
    ? historyData.events
    : (Array.isArray(filing.events) && filing.events.length > 0)
      ? filing.events
      : fallbackData.events;

  const events = (rawEvents && rawEvents.length > 0)
    ? rawEvents
    : ((filing.created_at || filing.updated_at) ? [{
        id: `ev-init-${filing.id}`,
        filing_id: filing.id,
        from_status: null,
        to_status: filing.status || 'ASSIGNED',
        timestamp: filing.created_at || filing.updated_at,
        actor_name: filing.created_by_name || 'Super Admin (Mounisha)',
        note: filing.is_misc ? `Task created: ${filing.task_title || filing.title || filing.code}` : 'Filing created and assigned'
      }] : []);

  const rounds = (historyData?.rounds && historyData.rounds.length > 0)
    ? historyData.rounds
    : (Array.isArray(filing.correction_rounds) && filing.correction_rounds.length > 0)
      ? filing.correction_rounds
      : fallbackData.rounds;

  const handleAction = async (toStatus, payload = {}, note = '') => {
    setActionError('');
    setIsActing(true);
    try {
      const res = await onTransition(toStatus, payload, note);
      if (res && res.error) {
        setActionError(res.error);
      }
    } catch (e) {
      setActionError(e.message || 'Action failed.');
    } finally {
      setIsActing(false);
    }
  };

  const handleRedirectAudit = async () => {
    const myName = currentUser?.name || 'You';
    if (!window.confirm(`Re-direct audit for ${filing.code} to yourself (${myName})?`)) return;
    setIsActing(true);
    setActionError('');
    try {
      const res = await onReassign(filing.assignee_id, currentUser.id, `Re-directed audit to ${myName} (auditor takeover)`);
      if (res && res.error) {
        setActionError(res.error);
      }
    } catch (err) {
      setActionError(err.message || 'Failed to re-direct audit.');
    } finally {
      setIsActing(false);
    }
  };

  const handleForceMove = async (e) => {
    e.preventDefault();
    if (!forceMoveStatus) {
      setActionError('Please select a target status.');
      return;
    }
    if (!forceMoveReason.trim()) {
      setActionError('Reason is mandatory for Super Admin force move.');
      return;
    }
    await handleAction(forceMoveStatus, {}, `Super Admin Force Move: ${forceMoveReason.trim()}`);
    setForceMoveStatus('');
    setForceMoveReason('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl md:max-w-2xl bg-[#060b24] border-l border-white/10 shadow-2xl flex flex-col h-full text-slate-100 z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 md:p-6 border-b border-white/10 bg-[#081033] shrink-0 space-y-3">
          {/* Top Bar: Badges + Close Window Button */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {cleanCodes.map((c, i) => (
                <span
                  key={i}
                  className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg border tracking-wider shrink-0 ${
                    filing.is_misc || filing.status === PATENT_STATUSES.MISC
                      ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40'
                      : 'bg-brand-500/20 text-brand-300 border-brand-500/30'
                  }`}
                >
                  {c}
                </span>
              ))}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                filing.status === PATENT_STATUSES.CLOSED
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : filing.status === PATENT_STATUSES.PAYMENT
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : filing.status === PATENT_STATUSES.AUDIT
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-white/10 text-white border-white/10'
              }`}>
                {filing.status}
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                v{filing.version}
              </span>
              {filing.temp_code && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <span className="text-purple-400 font-normal">Temp:</span>
                  <span>{filing.temp_code}</span>
                </span>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0 ml-auto"
              title="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Second Row: Title + Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-white/5">
            {/* Title / Edit Type */}
            <div className="flex-1 min-w-0">
              {isEditingType ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={customTypeInput}
                    onChange={e => setCustomTypeInput(e.target.value)}
                    placeholder="Enter manual filing type..."
                    className="glass-input text-xs py-1 px-2.5 bg-[#0a153a] text-white flex-1 min-w-[180px]"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      if (!customTypeInput.trim()) return;
                      if (onUpdateFilingType) {
                        await onUpdateFilingType(customTypeInput.trim());
                      }
                      setIsEditingType(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingType(false)}
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[11px] cursor-pointer shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-white tracking-tight break-words">
                    {filing.filing_type || 'Patent Filing'}
                  </h2>
                  {isSuperAdmin && onUpdateFilingType && (
                    <button
                      onClick={() => {
                        setCustomTypeInput(filing.filing_type || '');
                        setIsEditingType(true);
                      }}
                      className="text-[11px] text-brand-400 hover:text-brand-300 underline font-medium cursor-pointer shrink-0"
                    >
                      Edit Type
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {isOtherAuditorCard && (
                <button
                  type="button"
                  disabled={isActing}
                  onClick={handleRedirectAudit}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  title="Re-direct audit of this filing to yourself"
                >
                  <ArrowRightLeft size={13} />
                  <span>Re-direct</span>
                </button>
              )}
              {isSuperAdmin && onEditFiling && (
                <button
                  type="button"
                  onClick={() => onEditFiling(filing)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30 hover:bg-brand-500/30 font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  title="Edit filing details (Super Admin only)"
                >
                  <Edit3 size={13} />
                  <span>Edit</span>
                </button>
              )}
              {isSuperAdmin && (
                <button
                  onClick={() => setShowReassignModal(true)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-semibold transition cursor-pointer shrink-0 whitespace-nowrap"
                  title="Reassign filing"
                >
                  Reassign
                </button>
              )}
              {isLeader && onDeleteFiling && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to delete filing "${filing.code}"? This will permanently remove it from the workflow.`)) {
                      onDeleteFiling(filing);
                    }
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  title="Delete filing (Leader only)"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {actionError && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{actionError}</span>
            </div>
          )}

          {/* If MISC task has description, render full description */}
          {(filing.status === PATENT_STATUSES.MISC || filing.is_misc) && (filing.description || (filing.title && filing.title.includes('\n---\n'))) && (
            <div className="p-4 rounded-2xl bg-fuchsia-950/25 border border-fuchsia-500/30 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                <ListTodo size={14} />
                <span>Task Description / Instructions</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {filing.description || filing.title.split('\n---\n')[1]}
              </p>
            </div>
          )}

          {/* Action Execution Station (Role Guarded) */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Permitted Next Actions
            </h3>

            {/* 0. MISC -> Mark Done (Assignee or Leader only) */}
            {filing.status === PATENT_STATUSES.MISC && (
              (isAssignee || isLeader || isSuperAdmin) ? (
                <button
                  disabled={isActing}
                  onClick={() => handleAction(PATENT_STATUSES.CLOSED, {}, 'Task marked completed by assignee')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.3)] transition"
                >
                  <CheckCircle2 size={16} />
                  <span>Done — Mark Task Completed</span>
                </button>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Task assigned to {filing.assignee_name}. Only the assignee or leader can mark this task as done.
                </div>
              )
            )}

            {/* 1. ASSIGNED -> Accept (Assignee only) */}
            {filing.status === PATENT_STATUSES.ASSIGNED && (
              isAssignee ? (
                <button
                  disabled={isActing}
                  onClick={() => handleAction(PATENT_STATUSES.FILING, {}, 'Accepted by Assignee')}
                  className="w-full glass-button text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  <span>Accept Filing & Start Work</span>
                </button>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Awaiting acceptance by assignee ({filing.assignee_name}).
                </div>
              )
            )}

            {/* 2. FILING -> Send to Audit (Assignee only) */}
            {filing.status === PATENT_STATUSES.FILING && (
              isAssignee ? (
                <div className="space-y-3 p-3.5 rounded-xl bg-brand-950/40 border border-brand-500/20">
                  <div>
                    <label className="block text-[11px] font-semibold text-brand-200 mb-1 flex items-center justify-between">
                      <span>Temp Code / Application Number <span className="text-red-400">*</span></span>
                      <span className="text-[10px] text-slate-400 font-normal">Auditor requirement</span>
                    </label>
                    <input
                      type="text"
                      value={tempCodeInput}
                      onChange={e => setTempCodeInput(e.target.value)}
                      placeholder="e.g. TEMP-2026-001 or 202641012345"
                      className="w-full glass-input text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Filing Description / Notes for Auditor (Optional)
                    </label>
                    <textarea
                      value={filingNotesInput}
                      onChange={e => setFilingNotesInput(e.target.value)}
                      placeholder="Add draft summary, filing particulars, or notes for the auditor..."
                      rows={2}
                      className="w-full glass-input text-xs"
                    />
                  </div>
                  <button
                    disabled={isActing}
                    onClick={() => {
                      if (!tempCodeInput.trim()) {
                        setActionError('Please enter the Temp Code / Application Number before sending to audit.');
                        return;
                      }
                      const noteText = filingNotesInput.trim()
                        ? `Draft filed (Temp: ${tempCodeInput.trim()}) - ${filingNotesInput.trim()}`
                        : `Draft filed (Temp: ${tempCodeInput.trim()}); submitted for audit`;
                      handleAction(
                        PATENT_STATUSES.AUDIT,
                        { temp_code: tempCodeInput.trim(), filing_notes: filingNotesInput.trim() },
                        noteText
                      );
                    }}
                    className="w-full glass-button text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer bg-brand-600 hover:bg-brand-500"
                  >
                    <ArrowRight size={16} />
                    <span>Filed — Attach Temp Code & Send to Audit</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Assignee ({filing.assignee_name}) is currently drafting/filing.
                </div>
              )
            )}

            {/* 3. AUDIT -> Send for Correction OR Approve for Payment (Auditor only) */}
            {filing.status === PATENT_STATUSES.AUDIT && (
              isAuditor ? (
                <div className="space-y-3">
                  {filing.temp_code && (
                    <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-purple-300 uppercase tracking-wider font-bold">
                          Application Temp Code for Audit
                        </div>
                        <div className="text-sm font-mono font-bold text-white tracking-wide mt-0.5">
                          {filing.temp_code}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(filing.temp_code);
                          setCopiedTempCode(true);
                          setTimeout(() => setCopiedTempCode(false), 2000);
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 transition cursor-pointer"
                        title="Copy Temp Code"
                      >
                        <Copy size={13} />
                        <span>{copiedTempCode ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                      disabled={isActing}
                      onClick={() => setShowCorrectionModal(true)}
                      className="w-full bg-amber-600/80 hover:bg-amber-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw size={15} />
                      <span>Send for Correction</span>
                    </button>
                    <button
                      disabled={isActing}
                      onClick={() => handleAction(PATENT_STATUSES.PAYMENT, {}, 'Audit approved; proceed to payment')}
                      className="w-full bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <CheckCircle2 size={15} />
                      <span>Approve — Proceed to Payment</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 italic">
                    Under audit review by {filing.auditor_name}.
                  </div>
                  {isOtherAuditorCard && (
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={handleRedirectAudit}
                      className="w-full bg-amber-600/80 hover:bg-amber-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg"
                    >
                      <ArrowRightLeft size={14} />
                      <span>Re-direct Audit to Me ({currentUser?.name || 'You'})</span>
                    </button>
                  )}
                </div>
              )
            )}

            {/* 4. CORRECTION -> Return to Audit (Assignee only) */}
            {filing.status === PATENT_STATUSES.CORRECTION && (
              isAssignee ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Assignee Response Note (Optional)
                  </label>
                  <textarea
                    value={assigneeResponseNote}
                    onChange={e => setAssigneeResponseNote(e.target.value)}
                    placeholder="Describe fixes made (e.g., Claim 1 amended, Figure 3 replaced)..."
                    rows={2}
                    className="w-full glass-input text-xs"
                  />
                  <button
                    disabled={isActing}
                    onClick={() => handleAction(PATENT_STATUSES.AUDIT, { assignee_response: assigneeResponseNote }, 'Corrections addressed; resubmitted to audit')}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    <span>Corrected — Resubmit for Audit</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Awaiting corrections from assignee ({filing.assignee_name}).
                </div>
              )
            )}

            {/* 5. PAYMENT -> Confirm Payment (All users / Prathvi & Prashanth) */}
            {filing.status === PATENT_STATUSES.PAYMENT && (
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Official Payment Reference (Optional - defaults to 'Payment Done')
                </label>
                <input
                  type="text"
                  value={paymentRefInput}
                  onChange={e => setPaymentRefInput(e.target.value)}
                  placeholder="e.g. IPO-CH-2026-99214 or Bank UTR (defaults to Payment Done)"
                  className="w-full glass-input text-xs font-mono font-bold"
                />
                <button
                  disabled={isActing}
                  onClick={() => {
                    const ref = paymentRefInput.trim() || 'Payment Done';
                    handleAction(PATENT_STATUSES.ACK, { payment_reference: ref }, `Payment confirmed: ${ref}`);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg"
                >
                  <CheckCircle2 size={15} />
                  <span>Done for Payment & Proceed to Ack</span>
                </button>
              </div>
            )}

            {/* 6. ACK -> Ack mail sent / Close (ACK_CHECKER only) */}
            {filing.status === PATENT_STATUSES.ACK && (
              isAckChecker ? (
                <button
                  disabled={isActing}
                  onClick={() => handleAction(PATENT_STATUSES.CLOSED, {}, 'Ack mail confirmed; filing closed')}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
                >
                  <MailCheck size={16} />
                  <span>Ack Mail Sent — Close Filing</span>
                </button>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Pending acknowledgment confirmation by an ACK_CHECKER (Prashanth).
                </div>
              )
            )}

            {/* 7. CLOSED Status */}
            {filing.status === PATENT_STATUSES.CLOSED && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>This filing has completed all stages and is officially CLOSED.</span>
              </div>
            )}

            {/* SUPER_ADMIN Force Move Panel */}
            {isSuperAdmin && filing.status !== PATENT_STATUSES.CLOSED && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                  <ShieldAlert size={13} />
                  <span>Super Admin Force Move Override</span>
                </div>
                <form onSubmit={handleForceMove} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={forceMoveStatus}
                      onChange={e => setForceMoveStatus(e.target.value)}
                      className="glass-input text-xs bg-[#0a153a] cursor-pointer"
                    >
                      <option value="">Target Stage...</option>
                      {Object.values(PATENT_STATUSES)
                        .filter(s => s !== filing.status)
                        .map(s => (
                          <option key={s} value={s} className="bg-[#0a153a] text-white">
                            {s}
                          </option>
                        ))}
                    </select>
                    <input
                      type="text"
                      value={forceMoveReason}
                      onChange={e => setForceMoveReason(e.target.value)}
                      placeholder="Mandatory Reason..."
                      className="glass-input text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isActing || !forceMoveStatus || !forceMoveReason.trim()}
                    className="w-full text-xs font-bold py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition disabled:opacity-40"
                  >
                    Execute Force Move
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Key Metadata Table */}
          {filing.status === PATENT_STATUSES.MISC || filing.is_misc ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Assigned To</span>
                <span className="font-semibold text-white">{filing.assignee_name || 'Unassigned'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Assigned By</span>
                <span className="font-semibold text-white">Mounisha</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Priority</span>
                <span className="font-semibold text-amber-300">{filing.priority || 'Medium'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Due Date</span>
                <span className="font-semibold text-white">{filing.hard_deadline ? formatAuditDate(filing.hard_deadline) : 'No due date'}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {filing.temp_code && (
                <div className="col-span-2 p-3 rounded-xl bg-purple-950/25 border border-purple-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-purple-300 block mb-0.5 font-bold uppercase tracking-wider">
                      Application Temp Code
                    </span>
                    <span className="font-mono font-bold text-white text-sm tracking-wide">
                      {filing.temp_code}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(filing.temp_code);
                      setCopiedTempCode(true);
                      setTimeout(() => setCopiedTempCode(false), 2000);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <Copy size={12} />
                    <span>{copiedTempCode ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              )}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Assignee</span>
                <span className="font-semibold text-white">{filing.assignee_name || 'Unassigned'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Auditor</span>
                <span className="font-semibold text-white">{filing.auditor_name || 'Unassigned'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Est. Filing Time</span>
                <span className="font-semibold text-white">{filing.est_filing_minutes || 0} mins</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Est. Audit Time</span>
                <span className="font-semibold text-white">{filing.est_audit_minutes || 0} mins</span>
              </div>
              {filing.hard_deadline && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hard Deadline</span>
                  <span className="font-semibold text-amber-300">{formatAuditDate(filing.hard_deadline)}</span>
                </div>
              )}
              {filing.payment_reference && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Payment Ref</span>
                  <span className="font-mono font-bold text-emerald-300">{filing.payment_reference}</span>
                </div>
              )}
            </div>
          )}

          {/* Correction Rounds Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Correction Rounds ({rounds.length})
              </h3>
            </div>

            {rounds.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No correction rounds logged for this filing.</p>
            ) : (
              <div className="space-y-3">
                {rounds.map((round) => (
                  <div key={round.round_no} className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300">Round {round.round_no}</span>
                      <span className="text-[10px] text-slate-400">
                        {round.created_at ? new Date(round.created_at).toLocaleString() : ''}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/5">
                      {round.description}
                    </p>

                    {/* Image Attachments */}
                    {round.attachments && round.attachments.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {round.attachments.map((att, aIdx) => (
                          <div
                            key={aIdx}
                            onClick={() => setLightboxImage(att.preview || att.url)}
                            className="h-16 rounded-lg overflow-hidden border border-white/15 cursor-pointer relative group bg-black/40"
                          >
                            <img src={att.preview || att.url} alt="Correction reference" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold">
                              Zoom
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {round.assignee_response && (
                      <div className="text-[11px] bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-lg text-indigo-200 mt-2">
                        <strong className="block text-[10px] uppercase text-indigo-300">Assignee Response:</strong>
                        {round.assignee_response}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Event Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Audit Logs ({events.length})
            </h3>
            <div className="space-y-2 relative pl-4 border-l border-white/10 ml-2">
              {events.map((ev, idx) => (
                <div key={idx} className="relative pb-3 text-xs">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-500 border border-white" />
                  <div className="flex items-start justify-between gap-3 text-[11px] text-slate-400">
                    <span className="font-semibold text-white">
                      {ev.from_status ? `${ev.from_status} → ${ev.to_status}` : ev.to_status}
                    </span>
                    <div className="text-right shrink-0">
                      <div>
                        {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {formatAuditDate(ev.timestamp)}
                      </div>
                    </div>
                  </div>
                  {ev.note && (
                    <p className="text-[11px] text-slate-300 mt-0.5">{ev.note}</p>
                  )}
                  {ev.actor_name && (
                    <span className="text-[10px] text-slate-500">By {ev.actor_name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      <SendCorrectionModal
        isOpen={showCorrectionModal}
        onClose={() => setShowCorrectionModal(false)}
        onSubmit={async (payload) => {
          const res = await onTransition(PATENT_STATUSES.CORRECTION, payload, `Sent for correction: ${payload.description}`);
          return res;
        }}
        filing={filing}
      />

      <ReassignModal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        onSubmit={async ({ newAssigneeId, newAuditorId, reason }) => {
          const res = await onReassign(newAssigneeId, newAuditorId, reason);
          return res;
        }}
        filing={filing}
        allMembers={allMembers}
        patentRoleRecords={patentRoleRecords}
      />

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={lightboxImage} alt="Full resolution" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
