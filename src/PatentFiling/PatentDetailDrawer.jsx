// src/PatentFiling/PatentDetailDrawer.jsx
// Slide-over detail drawer for Patent Filings with role-authorized action buttons,
// audit event timeline, and historical correction rounds with image lightbox.

import { useState, useEffect } from 'react';
import {
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
  Edit3
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

  const fallbackData = getFilingEventsAndRounds(filing.id);
  const events = historyData?.events || fallbackData.events;
  const rounds = historyData?.rounds || fallbackData.rounds;

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
      <div className="relative w-full max-w-xl bg-[#060b24] border-l border-white/10 shadow-2xl flex flex-col h-full text-slate-100 z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-6 border-b border-white/10 flex items-start justify-between bg-[#081033]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30 tracking-wider">
                {filing.code}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white">
                {filing.status}
              </span>
              <span className="text-xs text-slate-400">
                v{filing.version}
              </span>
              {filing.temp_code && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                  Temp: {filing.temp_code}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {isEditingType ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={customTypeInput}
                    onChange={e => setCustomTypeInput(e.target.value)}
                    placeholder="Enter manual filing type..."
                    className="glass-input text-xs py-1 px-2.5 bg-[#0a153a] text-white"
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
                    className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-bold cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingType(false)}
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[11px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {filing.filing_type || 'Patent Filing'}
                  </h2>
                  {isSuperAdmin && onUpdateFilingType && (
                    <button
                      onClick={() => {
                        setCustomTypeInput(filing.filing_type || '');
                        setIsEditingType(true);
                      }}
                      className="text-[11px] text-brand-400 hover:text-brand-300 underline font-medium cursor-pointer"
                    >
                      Edit Type
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSuperAdmin && onEditFiling && (
              <button
                type="button"
                onClick={() => onEditFiling(filing)}
                className="text-xs px-2.5 py-1 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30 hover:bg-brand-500/30 font-semibold transition cursor-pointer flex items-center gap-1.5"
                title="Edit filing details (Super Admin only)"
              >
                <Edit3 size={12} />
                <span>Edit</span>
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => setShowReassignModal(true)}
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-semibold transition cursor-pointer"
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
                className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 font-semibold transition cursor-pointer flex items-center gap-1.5"
                title="Delete filing (Leader only)"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X size={18} />
            </button>
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

          {/* Action Execution Station (Role Guarded) */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Permitted Next Actions
            </h3>

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
                <div className="text-xs text-slate-400 italic">
                  Under audit review by {filing.auditor_name}.
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

            {/* 5. PAYMENT -> Confirm Payment (Any module user) */}
            {filing.status === PATENT_STATUSES.PAYMENT && (
              userRoles.length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Official Payment Reference <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={paymentRefInput}
                    onChange={e => setPaymentRefInput(e.target.value)}
                    placeholder="e.g. IPO-CH-2026-99214 or Bank UTR"
                    className="w-full glass-input text-xs font-mono font-bold"
                  />
                  <button
                    disabled={isActing || !paymentRefInput.trim()}
                    onClick={() => handleAction(PATENT_STATUSES.ACK, { payment_reference: paymentRefInput }, `Payment confirmed: ${paymentRefInput.trim()}`)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <CreditCard size={15} />
                    <span>Confirm Payment & Proceed to Ack</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Pending payment confirmation.
                </div>
              )
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
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 transition cursor-pointer"
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
                <span className="font-semibold text-amber-300">{filing.hard_deadline}</span>
              </div>
            )}
            {filing.payment_reference && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-slate-400 block mb-0.5">Payment Ref</span>
                <span className="font-mono font-bold text-emerald-300">{filing.payment_reference}</span>
              </div>
            )}
          </div>

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
              Audit Event Trail ({events.length})
            </h3>
            <div className="space-y-2 relative pl-4 border-l border-white/10 ml-2">
              {events.map((ev, idx) => (
                <div key={idx} className="relative pb-3 text-xs">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-500 border border-white" />
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-white">
                      {ev.from_status ? `${ev.from_status} → ${ev.to_status}` : ev.to_status}
                    </span>
                    <span>{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
