// src/PatentFiling/PatentFilingCard.jsx
// Dedicated Kanban Card for Patent Filing Workflow matching Tasks design tokens

import React from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  User,
  ShieldCheck,
  Flame,
  CheckCircle2
} from 'lucide-react';

export default function PatentFilingCard({ filing, onClick, currentUser, userRoles = [] }) {
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
      className={`group relative bg-white/5 border rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all duration-200 hover:bg-white/10 hover:border-white/20 cursor-pointer shadow-sm hover:shadow-lg ${
        isOverdue
          ? 'border-red-500/50 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
          : isUrgent
            ? 'border-amber-500/40'
            : 'border-white/10'
      }`}
    >
      {/* Top Row: Code + Filing Type + Priority */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30 shrink-0 tracking-wide">
            {filing.code}
          </span>
          <span className="text-[11px] font-medium text-slate-300 truncate" title={filing.filing_type}>
            {filing.filing_type}
          </span>
        </div>

        {/* Priority Badge */}
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
            filing.priority === 'Urgent'
              ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
              : filing.priority === 'High'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : filing.priority === 'Medium'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
          }`}
        >
          {filing.priority === 'Urgent' && <Flame size={10} />}
          {filing.priority}
        </span>
      </div>

      {/* Title / Client Description */}
      {filing.title && (
        <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed">
          {filing.title}
        </p>
      )}

      {/* Middle Row: Assignee & Auditor Avatars */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
        {/* Assignee */}
        <div 
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
            isUserAssignee 
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200 font-semibold' 
              : 'bg-white/5 border-white/10 text-slate-300'
          }`}
          title={`Assignee: ${filing.assignee_name || 'Unassigned'}`}
        >
          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
            {getInitials(filing.assignee_name)}
          </div>
          <span className="truncate max-w-[80px]">
            {filing.assignee_name || 'Assignee'}
          </span>
        </div>

        {/* Auditor */}
        <div 
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
            isUserAuditor 
              ? 'bg-purple-500/20 border-purple-500/40 text-purple-200 font-semibold' 
              : 'bg-white/5 border-white/10 text-slate-300'
          }`}
          title={`Auditor: ${filing.auditor_name || 'Unassigned'}`}
        >
          <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
            {getInitials(filing.auditor_name)}
          </div>
          <span className="truncate max-w-[80px]">
            {filing.auditor_name || 'Auditor'}
          </span>
        </div>
      </div>

      {/* Bottom Row: Time estimates + Deadlines + Correction Rounds */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[10px] text-slate-400">
        {/* Estimated Time Indicator */}
        <div className="flex items-center gap-1 font-medium bg-white/5 px-2 py-0.5 rounded-md border border-white/10 text-slate-300">
          <Clock size={11} className="text-brand-400" />
          <span>Est: {formatMins(totalEstMinutes)}</span>
        </div>

        {/* Correction Badge */}
        {filing.correction_count > 0 && (
          <span className="flex items-center gap-1 font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <RotateCcw size={10} />
            <span>Round {filing.correction_count}</span>
          </span>
        )}

        {/* Hard Deadline Badge */}
        {filing.hard_deadline && (
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold ${
              isOverdue
                ? 'bg-red-500/25 text-red-200 border-red-500/50 animate-pulse'
                : isDueToday
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                  : 'bg-white/5 text-slate-300 border-white/10'
            }`}
            title={`Statutory / Client Deadline: ${filing.hard_deadline}`}
          >
            <Calendar size={10} />
            <span>{filing.hard_deadline}</span>
          </div>
        )}
      </div>
    </div>
  );
}
