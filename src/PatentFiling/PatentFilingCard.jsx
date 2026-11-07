// src/PatentFiling/PatentFilingCard.jsx
// Dedicated Kanban Card for Patent Filing Workflow matching Tasks design tokens
// Supports both standard 6-stage Patent Filings and isolated MISC tasks.

import { Clock, Calendar, RotateCcw, Flame, Trash2, Edit3, CheckCircle2, ListTodo } from 'lucide-react';
import { PATENT_STATUSES } from '../patent/patentStateMachine.js';

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

export default function PatentFilingCard({
  filing,
  onClick,
  currentUser,
  onDelete,
  isLeader,
  isSuperAdmin,
  onEdit,
  onMarkDone
}) {
  const isMisc = filing.status === PATENT_STATUSES.MISC || filing.is_misc || filing.filing_type === 'MISC';
  const isUrgent = filing.priority === 'Urgent' || filing.priority === 'High';
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = filing.hard_deadline && filing.hard_deadline < todayStr && filing.status !== 'CLOSED';
  const isDueToday = filing.hard_deadline && filing.hard_deadline === todayStr;

  // Format estimated time
  const totalEstMinutes = (filing.est_filing_minutes || 0) + (filing.est_audit_minutes || 0);
  const formatMins = (mins) => {
    if (!mins) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  // Assignee / Auditor initials
  const getInitials = (name = 'Member') => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isUserAssignee = String(filing.assignee_id) === String(currentUser?.id) ||
    (currentUser?.name && filing.assignee_name && filing.assignee_name.toLowerCase().includes(currentUser.name.toLowerCase()));
  const isUserAuditor = String(filing.auditor_id) === String(currentUser?.id) ||
    (currentUser?.name && filing.auditor_name && filing.auditor_name.toLowerCase().includes(currentUser.name.toLowerCase()));

  const displayTitle = isMisc ? (filing.task_title || filing.title || filing.code) : (filing.filing_type || 'Patent Filing');
  const displayDescription = isMisc ? (filing.description || (filing.title && filing.title.includes('\n---\n') ? filing.title.split('\n---\n')[1] : '')) : '';

  // Clean and parse multi-codes (avoids ugly comma overflow or harsh text truncation)
  const cleanCodes = (filing.code || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);

  return (
    <div
      onClick={() => onClick(filing)}
      className={`group relative bg-[#0d1536]/80 border rounded-2xl p-3 flex flex-col gap-2.5 transition-all duration-200 hover:bg-[#121c45] hover:border-brand-500/40 hover:shadow-xl cursor-pointer ${
        isOverdue
          ? 'border-rose-500/50 bg-rose-500/[0.06] shadow-[0_0_15px_rgba(244,63,94,0.15)]'
          : isUrgent
            ? 'border-amber-500/35 bg-amber-500/[0.03]'
            : isMisc
              ? 'border-fuchsia-500/30 hover:border-fuchsia-400/50'
              : 'border-white/10'
      }`}
    >
      {/* Top Row: Code + Small Edit/Delete Buttons + Priority */}
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          {cleanCodes.length <= 1 ? (
            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg border tracking-wide truncate ${
              isMisc
                ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40'
                : 'bg-brand-500/15 text-brand-300 border-brand-500/30'
            }`}
            title={cleanCodes[0] || filing.code}
            >
              {cleanCodes[0] || filing.code}
            </span>
          ) : cleanCodes.length === 2 ? (
            <div className="flex items-center gap-1 min-w-0" title={`Codes: ${cleanCodes.join(', ')}`}>
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-lg border tracking-wide truncate bg-brand-500/15 text-brand-300 border-brand-500/30">
                {cleanCodes[0]}
              </span>
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-lg border tracking-wide truncate bg-brand-500/15 text-brand-300 border-brand-500/30">
                {cleanCodes[1]}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0" title={`All ${cleanCodes.length} Codes:\n${cleanCodes.join(', ')}`}>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg border tracking-wide truncate bg-brand-500/15 text-brand-300 border-brand-500/30">
                {cleanCodes[0]}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                +{cleanCodes.length - 1} more
              </span>
            </div>
          )}

          {isSuperAdmin && onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(filing);
              }}
              className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-brand-500/20 text-slate-400 hover:text-brand-300 rounded-lg shrink-0 cursor-pointer"
              title="Edit filing (Super Admin only)"
            >
              <Edit3 size={12} />
            </button>
          )}
          {isLeader && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Are you sure you want to delete "${filing.code}"? This will permanently remove it from the workflow.`)) {
                  onDelete(filing);
                }
              }}
              className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 rounded-lg shrink-0 cursor-pointer"
              title="Delete (Leader only)"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Priority Badge */}
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
            filing.priority === 'Urgent'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : filing.priority === 'High'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : filing.priority === 'Medium'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
          }`}
        >
          {filing.priority === 'Urgent' && <Flame size={10} className="text-rose-400" />}
          {filing.priority}
        </span>
      </div>

      {/* Title / Temp Code / Description */}
      <div className="pt-0.5 flex flex-col gap-1.5">
        <h4 className="text-xs font-bold text-slate-100 tracking-tight leading-snug break-words" title={displayTitle}>
          {displayTitle}
        </h4>

        {/* Application Temp Code on its own dedicated row (Never breaks or chokes the title) */}
        {!isMisc && filing.temp_code && (
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[9.5px] uppercase font-bold text-purple-400/90 tracking-wider shrink-0">
              Temp:
            </span>
            <span
              className="text-[10.5px] px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-200 border border-purple-500/30 font-mono font-semibold tracking-wide truncate max-w-full"
              title={`Application Temp Code: ${filing.temp_code}`}
            >
              {filing.temp_code}
            </span>
          </div>
        )}

        {/* If MISC task has description, render preview */}
        {isMisc && displayDescription && (
          <p className="text-[11px] text-slate-300 bg-white/[0.03] p-2 rounded-xl border border-white/5 line-clamp-2 leading-relaxed">
            {displayDescription}
          </p>
        )}
      </div>

      {/* Personnel Row */}
      {isMisc ? (
        // MISC: Clean Assignee & Assigner display
        <div className="flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px]">
          <div className="flex items-center gap-2 min-w-0 flex-1" title={`Assignee: ${filing.assignee_name || 'Unassigned'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm ${
              isUserAssignee ? 'bg-fuchsia-500 ring-2 ring-fuchsia-400/50' : 'bg-fuchsia-600/80 border border-fuchsia-400/30'
            }`}>
              {getInitials(filing.assignee_name)}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider leading-none">Assigned To</span>
              <span className="text-slate-200 font-semibold truncate text-[11.5px] leading-tight mt-0.5">
                {filing.assignee_name || 'Unassigned'}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end text-right min-w-0 shrink-0">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider leading-none">Assigned By</span>
            <span className="text-slate-300 font-semibold truncate text-[11.5px] leading-tight mt-0.5">
              {filing.created_by_name || 'Mounisha'}
            </span>
          </div>
        </div>
      ) : (
        // Regular Filing: Filer -> Reviewer with equal shared flex room
        <div className="flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px]">
          <div className="flex items-center gap-2 min-w-0 flex-1" title={`Filer (Assignee): ${filing.assignee_name || 'Unassigned'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm ${
              isUserAssignee ? 'bg-indigo-500 ring-2 ring-indigo-400/50' : 'bg-indigo-600/80 border border-indigo-400/30'
            }`}>
              {getInitials(filing.assignee_name)}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] uppercase font-extrabold text-indigo-300/85 tracking-wider leading-none">Filer</span>
              <span className="text-slate-200 font-semibold truncate text-[11.5px] leading-tight mt-0.5">
                {filing.assignee_name || 'Assignee'}
              </span>
            </div>
          </div>

          <span className="text-slate-500 text-xs font-bold shrink-0 px-0.5">&rarr;</span>

          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right" title={`Reviewer (Auditor): ${filing.auditor_name || 'Unassigned'}`}>
            <div className="flex flex-col min-w-0 flex-1 items-end">
              <span className="text-[9px] uppercase font-extrabold text-purple-300/85 tracking-wider leading-none">Reviewer</span>
              <span className="text-slate-200 font-semibold truncate text-[11.5px] leading-tight mt-0.5">
                {filing.auditor_name || 'Auditor'}
              </span>
            </div>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm ${
              isUserAuditor ? 'bg-purple-500 ring-2 ring-purple-400/50' : 'bg-purple-600/80 border border-purple-400/30'
            }`}>
              {getInitials(filing.auditor_name)}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Row */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
        {isMisc ? (
          <div className="flex items-center gap-1 font-medium text-fuchsia-300">
            <ListTodo size={11} className="text-fuchsia-400 shrink-0" />
            <span>Standalone Task</span>
          </div>
        ) : (
          <div 
            className="flex items-center gap-1 font-medium text-slate-300"
            title={`Total Estimate: ${formatMins(totalEstMinutes)}`}
          >
            <Clock size={11} className="text-brand-400 shrink-0" />
            <span>{formatMins(totalEstMinutes)}</span>
          </div>
        )}

        {/* Correction Badge (Filings only) */}
        {!isMisc && filing.correction_count > 0 && (
          <span className="flex items-center gap-1 font-bold text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
            <RotateCcw size={10} />
            <span>R{filing.correction_count}</span>
          </span>
        )}

        {/* Deadline or Card Date in DD/MM/YYYY */}
        {filing.hard_deadline ? (
          <div
            className={`flex items-center gap-1 font-semibold text-[11px] px-1.5 py-0.5 rounded-md shrink-0 ${
              isOverdue
                ? 'bg-rose-500/25 text-rose-200 border border-rose-500/40 animate-pulse'
                : isDueToday
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                  : 'text-slate-300'
            }`}
            title={`Deadline: ${formatAuditDate(filing.hard_deadline)}`}
          >
            <Calendar size={11} className={isOverdue ? 'text-rose-400' : isDueToday ? 'text-amber-400' : 'text-slate-400'} />
            <span>{formatAuditDate(filing.hard_deadline)}</span>
          </div>
        ) : (filing.created_at || filing.updated_at) ? (
          <div
            className="flex items-center gap-1 font-medium text-[11px] text-slate-400 shrink-0"
            title={`Date: ${formatAuditDate(filing.created_at || filing.updated_at)}`}
          >
            <Calendar size={11} className="text-slate-500" />
            <span>{formatAuditDate(filing.created_at || filing.updated_at)}</span>
          </div>
        ) : null}
      </div>

      {/* Quick "Mark Done" Button for Assignee / Leader when card is in MISC */}
      {filing.status === PATENT_STATUSES.MISC && (isUserAssignee || isLeader || isSuperAdmin) && onMarkDone && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMarkDone(filing);
          }}
          className="w-full mt-0.5 py-1.5 px-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
        >
          <CheckCircle2 size={13} />
          <span>Mark Done</span>
        </button>
      )}
    </div>
  );
}
