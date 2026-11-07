// src/PatentFiling/NewMiscTaskModal.jsx
// Lightweight, focused task creation modal for Super Admin Mounisha
// Creates standalone tasks that go directly into the MISC stage.

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  ListTodo,
  User,
  AlertCircle,
  Calendar,
  Sparkles,
  Flame,
  Check
} from 'lucide-react';
import { PATENT_STATUSES } from '../patent/patentStateMachine.js';
import { isRealHumanTeamMember } from '../patent/patentRoles.js';

export default function NewMiscTaskModal({
  isOpen,
  onClose,
  onSubmit,
  allMembers = [],
  filings = []
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [deadline, setDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Calculate next sequential MISC code: e.g. MISC-001, MISC-002...
  const computedNextCode = (() => {
    let maxNum = 0;
    if (Array.isArray(filings)) {
      filings.forEach(f => {
        if (f.code && /^MISC-(\d+)$/i.test(f.code.trim())) {
          const num = parseInt(f.code.trim().replace(/^MISC-/i, ''), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }
    const nextNum = maxNum + 1;
    return `MISC-${String(nextNum).padStart(3, '0')}`;
  })();

  // Filter out non-human categories, board columns, and bots
  const validMembers = useMemo(() => {
    return (allMembers || [])
      .filter(isRealHumanTeamMember)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allMembers]);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setError('');
      setPriority('Medium');
      setDeadline('');
      // Default to first valid real member if available
      if (validMembers && validMembers.length > 0 && !assigneeId) {
        setAssigneeId(validMembers[0].id);
      }
    }
  }, [isOpen, validMembers]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Task Title is required.');
      return;
    }

    if (!assigneeId) {
      setError('Please select a team member to assign this task to.');
      return;
    }

    setIsSubmitting(true);
    try {
      const taskData = {
        code: computedNextCode,
        filing_type: 'MISC',
        title: cleanTitle,
        description: description.trim(),
        assignee_id: assigneeId,
        priority,
        hard_deadline: deadline || null,
        status: PATENT_STATUSES.MISC
      };

      const res = await onSubmit(taskData);
      if (res && res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#080d26] border border-white/10 shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-fuchsia-950/40 via-purple-950/30 to-[#080d26]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-fuchsia-600 to-pink-600 flex items-center justify-center text-white shadow-lg border border-fuchsia-400/30">
              <ListTodo size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  New Miscellaneous Task
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  {computedNextCode}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Assign a standalone task directly to anyone. Lands in MISC stage.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Task Title (Primary) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Task Title <span className="text-fuchsia-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Draft Response Letter, Client Query, Form 3 Update..."
              className="w-full glass-input text-xs font-semibold py-2.5 px-3.5 rounded-xl"
              autoFocus
            />
          </div>

          {/* Task Description */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Task Description / Instructions</span>
              <span className="text-[10px] text-slate-400 font-normal">Optional details</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Write the full instructions, notes, links or what the assignee needs to complete..."
              rows={4}
              className="w-full glass-input text-xs py-2 px-3 rounded-xl custom-scrollbar leading-relaxed"
            />
          </div>

          {/* Assign To (Assignee) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Assign To <span className="text-fuchsia-400">*</span>
            </label>
            <div className="relative">
              <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full glass-input text-xs py-2.5 pl-9 pr-3.5 bg-[#0a153a] text-slate-100 cursor-pointer rounded-xl font-medium"
                style={{ colorScheme: 'dark' }}
              >
                <option value="" disabled className="bg-[#0a153a] text-slate-400">
                  Select team member...
                </option>
                {validMembers.map(m => (
                  <option key={m.id} value={m.id} className="bg-[#0a153a] text-white">
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority & Deadline Grid */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Priority */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1">
                <Flame size={12} className="text-amber-400" />
                <span>Priority</span>
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full glass-input text-xs py-2 px-3 bg-[#0a153a] text-slate-100 cursor-pointer rounded-xl"
                style={{ colorScheme: 'dark' }}
              >
                <option value="Low" className="bg-[#0a153a] text-white">Low</option>
                <option value="Medium" className="bg-[#0a153a] text-white">Medium</option>
                <option value="High" className="bg-[#0a153a] text-white">High</option>
                <option value="Urgent" className="bg-[#0a153a] text-white">Urgent</option>
              </select>
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1">
                <Calendar size={12} className="text-brand-400" />
                <span>Due Date (Optional)</span>
              </label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full glass-input text-xs py-2 px-3 bg-[#0a153a] text-slate-100 cursor-pointer rounded-xl"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.4)] flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Assign Task</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
