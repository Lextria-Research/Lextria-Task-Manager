// src/PatentFiling/PatentKanbanBoard.jsx
// Dedicated 6-column Kanban Board for Patent Filing Workflow

import React from 'react';
import {
  Inbox,
  FileEdit,
  Search,
  RotateCcw,
  CreditCard,
  MailCheck,
  Archive,
  CheckCircle2
} from 'lucide-react';
import { PATENT_STATUSES, PATENT_ROLES, hasPatentRole } from '../patent/patentStateMachine.js';
import PatentFilingCard from './PatentFilingCard.jsx';

export const KANBAN_COLUMNS = [
  {
    id: PATENT_STATUSES.ASSIGNED,
    label: 'Assigned',
    icon: Inbox,
    color: 'from-blue-600 to-sky-600',
    borderColor: 'border-blue-500/30',
    badgeBg: 'bg-blue-500/20 text-blue-300'
  },
  {
    id: PATENT_STATUSES.FILING,
    label: 'Filing',
    icon: FileEdit,
    color: 'from-indigo-600 to-blue-600',
    borderColor: 'border-indigo-500/30',
    badgeBg: 'bg-indigo-500/20 text-indigo-300'
  },
  {
    id: PATENT_STATUSES.AUDIT,
    label: 'Audit',
    icon: Search,
    color: 'from-purple-600 to-indigo-600',
    borderColor: 'border-purple-500/30',
    badgeBg: 'bg-purple-500/20 text-purple-300'
  },
  {
    id: PATENT_STATUSES.CORRECTION,
    label: 'Correction',
    icon: RotateCcw,
    color: 'from-amber-600 to-orange-600',
    borderColor: 'border-amber-500/30',
    badgeBg: 'bg-amber-500/20 text-amber-300'
  },
  {
    id: PATENT_STATUSES.PAYMENT,
    label: 'Payment',
    icon: CreditCard,
    color: 'from-emerald-600 to-teal-600',
    borderColor: 'border-emerald-500/30',
    badgeBg: 'bg-emerald-500/20 text-emerald-300'
  },
  {
    id: PATENT_STATUSES.ACK,
    label: 'Ack',
    icon: MailCheck,
    color: 'from-teal-600 to-cyan-600',
    borderColor: 'border-teal-500/30',
    badgeBg: 'bg-teal-500/20 text-teal-300'
  }
];

export default function PatentKanbanBoard({
  filings = [],
  onCardClick,
  currentUser,
  userRoles = [],
  viewScope = 'ALL', // 'MY' | 'ALL'
  showClosedArchive = false
}) {
  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN);

  // Filter filings based on role-scoped view
  const filterByRoleScope = (filing) => {
    // If viewing Closed archive
    if (showClosedArchive) {
      return filing.status === PATENT_STATUSES.CLOSED;
    }

    if (filing.status === PATENT_STATUSES.CLOSED) return false;

    // Super Admin sees all
    if (isSuperAdmin || viewScope === 'ALL') {
      return true;
    }

    const isMine = String(filing.assignee_id) === String(currentUser?.id) ||
      (currentUser?.name && filing.assignee_name && filing.assignee_name.toLowerCase().includes(currentUser.name.toLowerCase()));
    const isAuditedByMe = String(filing.auditor_id) === String(currentUser?.id) ||
      (currentUser?.name && filing.auditor_name && filing.auditor_name.toLowerCase().includes(currentUser.name.toLowerCase()));

    // Payment and Ack columns are visible to all module users
    if (filing.status === PATENT_STATUSES.PAYMENT || filing.status === PATENT_STATUSES.ACK) {
      return true;
    }

    // Assignee view: their Assigned, Filing, Correction
    if (filing.status === PATENT_STATUSES.ASSIGNED || filing.status === PATENT_STATUSES.FILING || filing.status === PATENT_STATUSES.CORRECTION) {
      return isMine;
    }

    // Auditor view: Audit column where they are the auditor
    if (filing.status === PATENT_STATUSES.AUDIT) {
      return isAuditedByMe;
    }

    return true;
  };

  const scopedFilings = filings.filter(filterByRoleScope);

  // If viewing Closed Archive
  if (showClosedArchive) {
    const closedFilings = filings.filter(f => f.status === PATENT_STATUSES.CLOSED);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-300 pb-2 border-b border-white/10">
          <Archive size={16} className="text-emerald-400" />
          <span className="font-bold">Closed Filings Archive</span>
          <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
            {closedFilings.length}
          </span>
        </div>

        {closedFilings.length === 0 ? (
          <div className="text-center py-16 rounded-3xl bg-white/5 border border-white/10 text-slate-400 text-xs">
            No closed patent filings found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {closedFilings.map(filing => (
              <PatentFilingCard
                key={filing.id}
                filing={filing}
                onClick={onCardClick}
                currentUser={currentUser}
                userRoles={userRoles}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render 6 Kanban Columns
  return (
    <div className="grid grid-cols-6 gap-3.5 items-start min-w-[1360px]">
      {KANBAN_COLUMNS.map(col => {
        const columnFilings = scopedFilings.filter(f => f.status === col.id);
        const Icon = col.icon;

        return (
          <div
            key={col.id}
            className="flex flex-col rounded-3xl bg-[#080d26]/70 border border-white/10 backdrop-blur-xl overflow-hidden shadow-xl"
          >
            {/* Column Header */}
            <div className={`p-3.5 border-b ${col.borderColor} bg-white/5 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${col.color} flex items-center justify-center text-white shadow-md`}>
                  <Icon size={14} />
                </div>
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                  {col.label}
                </h3>
              </div>

              {/* Count Badge */}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                {columnFilings.length}
              </span>
            </div>

            {/* Column Card Body */}
            <div className="p-3 flex flex-col gap-3 min-h-[500px] max-h-[calc(100vh-270px)] overflow-y-auto custom-scrollbar">
              {columnFilings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 border border-dashed border-white/5 rounded-2xl">
                  <span className="text-xs italic">No codes</span>
                </div>
              ) : (
                columnFilings.map(filing => (
                  <PatentFilingCard
                    key={filing.id}
                    filing={filing}
                    onClick={onCardClick}
                    currentUser={currentUser}
                    userRoles={userRoles}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
