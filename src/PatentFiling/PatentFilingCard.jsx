// src/PatentFiling/PatentFilingCard.jsx
// Dedicated Kanban Card for Patent Filing Workflow matching Tasks design tokens

import { Clock, Calendar, RotateCcw, Flame } from 'lucide-react';

export default function PatentFilingCard({ filing, onClick, currentUser }) {
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

  return (
    <div
      onClick={() => onClick(filing)}
      className={`group relative bg-[#0d1536]/80 border rounded-2xl p-3 flex flex-col gap-2.5 transition-all duration-200 hover:bg-[#121c45] hover:border-brand-500/40 hover:shadow-xl cursor-pointer ${
        isOverdue
          ? 'border-rose-500/50 bg-rose-500/[0.06] shadow-[0_0_15px_rgba(244,63,94,0.15)]'
          : isUrgent
            ? 'border-amber-500/35 bg-amber-500/[0.03]'
            : 'border-white/10'
      }`}
    >
      {/* Top Row: Code + Priority (Zero Overlap, Guaranteed Space) */}
      <div className="flex items-center justify-between gap-2 w-full">
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-500/15 text-brand-300 border border-brand-500/30 tracking-wide shrink-0">
          {filing.code}
        </span>

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

      {/* Prominent Filing Type Title */}
      <div className="pt-0.5">
        <h4 className="text-xs font-semibold text-slate-100 tracking-tight leading-snug truncate" title={filing.filing_type}>
          {filing.filing_type || 'Patent Filing'}
        </h4>
      </div>

      {/* Personnel Row: Filer -> Reviewer (Clean & Uncrowded) */}
      <div className="flex items-center justify-between gap-1.5 py-1.5 px-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px]">
        {/* Filer */}
        <div className="flex items-center gap-1.5 min-w-0" title={`Assignee (Filer): ${filing.assignee_name || 'Unassigned'}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${
            isUserAssignee ? 'bg-indigo-500 ring-2 ring-indigo-400/50' : 'bg-indigo-600/70 border border-indigo-400/30'
          }`}>
            {getInitials(filing.assignee_name)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider leading-none">Filer</span>
            <span className="text-slate-200 font-medium truncate max-w-[65px] text-[11px] leading-tight">
              {filing.assignee_name || 'Assignee'}
            </span>
          </div>
        </div>

        {/* Direction Arrow */}
        <span className="text-slate-500 text-[11px] font-bold shrink-0">&rarr;</span>

        {/* Auditor */}
        <div className="flex items-center gap-1.5 min-w-0 justify-end" title={`Auditor (Reviewer): ${filing.auditor_name || 'Unassigned'}`}>
          <div className="flex flex-col min-w-0 items-end text-right">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider leading-none">Reviewer</span>
            <span className="text-slate-200 font-medium truncate max-w-[65px] text-[11px] leading-tight">
              {filing.auditor_name || 'Auditor'}
            </span>
          </div>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${
            isUserAuditor ? 'bg-purple-500 ring-2 ring-purple-400/50' : 'bg-purple-600/70 border border-purple-400/30'
          }`}>
            {getInitials(filing.auditor_name)}
          </div>
        </div>
      </div>

      {/* Bottom Row: Estimated Time + Correction Count + Deadline */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
        {/* Estimated Time */}
        <div 
          className="flex items-center gap-1 font-medium text-slate-300"
          title={`Total Estimate: ${formatMins(totalEstMinutes)}`}
        >
          <Clock size={11} className="text-brand-400 shrink-0" />
          <span>{formatMins(totalEstMinutes)}</span>
        </div>

        {/* Correction Badge */}
        {filing.correction_count > 0 && (
          <span className="flex items-center gap-1 font-bold text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
            <RotateCcw size={10} />
            <span>R{filing.correction_count}</span>
          </span>
        )}

        {/* Deadline */}
        {filing.hard_deadline && (
          <div
            className={`flex items-center gap-1 font-semibold text-[11px] px-1.5 py-0.5 rounded-md shrink-0 ${
              isOverdue
                ? 'bg-rose-500/25 text-rose-200 border border-rose-500/40 animate-pulse'
                : isDueToday
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                  : 'text-slate-300'
            }`}
            title={`Statutory Deadline: ${filing.hard_deadline}`}
          >
            <Calendar size={11} className={isOverdue ? 'text-rose-400' : isDueToday ? 'text-amber-400' : 'text-slate-400'} />
            <span>{filing.hard_deadline}</span>
          </div>
        )}
      </div>
    </div>
  );
}
