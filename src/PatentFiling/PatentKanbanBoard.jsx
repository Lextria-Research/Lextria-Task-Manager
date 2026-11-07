// src/PatentFiling/PatentKanbanBoard.jsx
// Dedicated 7-column Kanban Board for Patent Filing Workflow with standalone MISC stage

import React from 'react';
import {
  ListTodo,
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
import { isMemberMatch } from '../patent/patentRoles.js';
import { isLeaderOrSharan } from '../attachmentUtils.js';
import PatentFilingCard from './PatentFilingCard.jsx';

export const KANBAN_COLUMNS = [
  {
    id: PATENT_STATUSES.MISC,
    label: 'MISC',
    icon: ListTodo,
    color: 'from-fuchsia-600 to-pink-600',
    borderColor: 'border-fuchsia-500/30',
    badgeBg: 'bg-fuchsia-500/20 text-fuchsia-300'
  },
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
  showClosedArchive = false,
  codeScopeFilter = 'ALL',
  onDeleteFiling,
  onEditFiling,
  onMarkDone
}) {
  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN);
  const isLeader = isSuperAdmin ||
    (currentUser?.role && currentUser.role.toLowerCase() === 'leader') ||
    isLeaderOrSharan(currentUser);

  // Filter filings based on role-scoped view and toggle switch:
  // 1. Toggle switch 'My Codes' vs 'All Codes'
  // 2. All team members have access to Payment folder cards
  // 3. MISC tasks visible to assigned member, creator, and leaders
  const filterByRoleScope = (filing) => {
    // If viewing Closed archive
    if (showClosedArchive) {
      if (filing.status !== PATENT_STATUSES.CLOSED) return false;
      if (codeScopeFilter === 'ALL' || isLeader) return true;
      const isMine = isMemberMatch(currentUser?.id, currentUser?.name, filing.assignee_id, filing.assignee_name);
      const isAuditedByMe = isMemberMatch(currentUser?.id, currentUser?.name, filing.auditor_id, filing.auditor_name);
      return isMine || isAuditedByMe;
    }

    if (filing.status === PATENT_STATUSES.CLOSED) return false;

    // Requirement 3: All must have access to payment folder so that they can send it to ac stage
    if (filing.status === PATENT_STATUSES.PAYMENT) {
      return true;
    }

    // Toggle switch: 'All Codes' shows all codes for everyone
    if (codeScopeFilter === 'ALL') {
      return true;
    }

    // When 'My Codes' is toggled:
    if (filing.status === PATENT_STATUSES.MISC) {
      if (isLeader) return true;
      const isMine = isMemberMatch(currentUser?.id, currentUser?.name, filing.assignee_id, filing.assignee_name);
      const isCreator = isMemberMatch(currentUser?.id, currentUser?.name, filing.created_by, filing.created_by_name);
      return isMine || isCreator;
    }

    const isMine = isMemberMatch(currentUser?.id, currentUser?.name, filing.assignee_id, filing.assignee_name);
    const isAuditedByMe = isMemberMatch(currentUser?.id, currentUser?.name, filing.auditor_id, filing.auditor_name);
    const isAckChecker = hasPatentRole(userRoles, PATENT_ROLES.ACK_CHECKER);

    if (isMine || isAuditedByMe) return true;
    if (isAckChecker && (filing.status === PATENT_STATUSES.PAYMENT || filing.status === PATENT_STATUSES.ACK)) return true;

    return false;
  };

  const scopedFilings = filings.filter(filterByRoleScope);

  // If viewing Closed Archive
  if (showClosedArchive) {
    const closedFilings = filings.filter(filterByRoleScope);
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
                isLeader={isLeader}
                isSuperAdmin={isSuperAdmin}
                onDelete={onDeleteFiling}
                onEdit={onEditFiling}
                onMarkDone={onMarkDone}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render 7 Kanban Columns (MISC + 6 Pipeline Stages)
  return (
    <div className="flex gap-4 items-start min-w-max pb-4">
      {KANBAN_COLUMNS.map(col => {
        const columnFilings = scopedFilings.filter(f => f.status === col.id);
        const Icon = col.icon;

        return (
          <div
            key={col.id}
            className="w-[280px] shrink-0 flex flex-col rounded-3xl bg-[#080d26]/70 border border-white/10 backdrop-blur-xl overflow-hidden shadow-xl"
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
                  <span className="text-xs italic">No items</span>
                </div>
              ) : (
                columnFilings.map(filing => (
                  <PatentFilingCard
                    key={filing.id}
                    filing={filing}
                    onClick={onCardClick}
                    currentUser={currentUser}
                    userRoles={userRoles}
                    isLeader={isLeader}
                    isSuperAdmin={isSuperAdmin}
                    onDelete={onDeleteFiling}
                    onEdit={onEditFiling}
                    onMarkDone={onMarkDone}
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
