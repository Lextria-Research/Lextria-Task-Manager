import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  BookOpen, 
  Lightbulb, 
  CheckCircle2, 
  MessageSquare, 
  FolderKanban, 
  Clock, 
  ShieldCheck, 
  FileSpreadsheet, 
  Bell, 
  Check 
} from 'lucide-react';

export default function MemberManualModal({ isOpen, onClose, currentUser }) {
  const [activeTab, setActiveTab] = useState('features');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const storageKey = 'lextria_guide_seen_' + (currentUser?.id || currentUser?.name || 'user');
      setDontShowAgain(localStorage.getItem(storageKey) === 'true');
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleDismiss = () => {
    const storageKey = 'lextria_guide_seen_' + (currentUser?.id || currentUser?.name || 'user');
    if (dontShowAgain) {
      localStorage.setItem(storageKey, 'true');
    } else {
      localStorage.removeItem(storageKey);
    }
    sessionStorage.setItem('lextria_guide_dismissed_session', 'true');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      style={{ background: 'rgba(4, 7, 20, 0.88)', backdropFilter: 'blur(16px)' }}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden border border-white/15 shadow-[0_25px_70px_rgba(0,0,0,0.85)] bg-[#0c1228] text-slate-100"
      >
        {/* Top Header Banner */}
        <div className="flex-shrink-0 px-6 sm:px-8 py-5 border-b border-white/10 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 relative">
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 rounded-xl bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Close manual"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3">
            <img 
              src="/logo.png" 
              alt="Lextria Logo" 
              className="w-11 h-11 rounded-full object-cover shadow-lg border border-white/20 shrink-0" 
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase px-2 py-0.5 rounded-md bg-white/10 border border-white/10">
                  Version 2.0 • Member Manual & Release Guide
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
                Welcome, {currentUser?.name || 'Team Member'}!
              </h1>
              <p className="text-blue-100/80 text-xs sm:text-sm mt-0.5">
                Here is your quick guide to the new features, the Query Hub, and how to navigate your workspace.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex-shrink-0 flex border-b border-white/10 bg-black/20">
          {[
            { id: 'features', label: "What's New", icon: <Sparkles size={16} /> },
            { id: 'manual', label: 'How-To Manual', icon: <BookOpen size={16} /> },
            { id: 'guidelines', label: 'Access & Best Practices', icon: <Lightbulb size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border-b-2 ${
                activeTab === tab.id
                  ? 'text-white border-blue-400 bg-white/5'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5 custom-scrollbar text-slate-200">
          {/* TAB 1: WHAT'S NEW */}
          {activeTab === 'features' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-blue-500/20 text-blue-300 shrink-0 mt-0.5">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">1. Secure Personal Authentication</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Every team member now has their own dedicated username and 4-digit password. Sessions are securely remembered so you stay logged in. When leaving your desk, you can easily log out from the top-right navbar.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 shrink-0 mt-0.5">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">2. Query Hub (Ticket Management)</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Need guidance, approvals, or clarification from the Leader? Click the <strong>Queries</strong> tab in the sidebar! Select your department board (Litigation, Compliance, Patent, TM/CR/ID, General, Admin), raise tickets, attach reference screenshots, and chat directly in the thread.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 shrink-0 mt-0.5">
                  <FolderKanban size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">3. Project Reporting Board</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Click <strong>Project Reporting</strong> in the left sidebar navigation to view high-level client deliverables across 5 distinct phases: <em>Not Started, In Progress, Client Review, On Hold, and Completed</em>. Post threaded status updates to keep everyone aligned.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">4. Robust Drag & Drop & Non-Reverting Tasks</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Dragging tasks between members or reordering cards is now 100% reliable and permanent. The auto-archive and completion timestamps are safeguarded so your progress never reverts.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 shrink-0 mt-0.5">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">5. Multi-Sheet Excel Reports</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Under <strong>Queries &rarr; Export</strong>, team members and leaders can download complete work history and ticket records formatted into 5 clean Excel worksheets.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HOW-TO MANUAL */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> Managing Your Tasks
                </h3>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                  <li><strong>Complete a Task:</strong> Click the check circle icon on any task card, or open details and toggle the status.</li>
                  <li><strong>Move / Reassign Tasks:</strong> Click and drag any card to reorder or reassign to a teammate.</li>
                  <li><strong>Priorities & Tags:</strong> Assign High, Medium, or Low priority badges, and select tags for categorization.</li>
                  <li><strong>Search:</strong> Use the search bar in the top navbar to instantly find tasks by title, tag, or assignee.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-blue-400" /> Time Tracking & Timers
                </h3>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                  <li><strong>Set Estimated Duration:</strong> Open any task card and pick a required time (e.g. 15m, 30m, 1h, or custom).</li>
                  <li><strong>Countdown Starts Automatically:</strong> A live timer immediately begins tracking your remaining time.</li>
                  <li><strong>Completing Finishes Timer:</strong> Marking the task complete automatically stops and finalizes the timer.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <MessageSquare size={16} className="text-purple-400" /> Raising a Query Ticket
                </h3>
                <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside">
                  <li>Click <strong>Queries</strong> in the left sidebar navigation.</li>
                  <li>Select your department board (e.g., <em>Litigation, Patent, TM/CR/ID</em>).</li>
                  <li>Click <strong>+ New query</strong> button on the top right.</li>
                  <li>Choose urgency (<em>High, Medium, Low</em>), type what you need, and optionally upload images.</li>
                  <li>Click <strong>Raise ticket</strong>. You and the Leader can now discuss and resolve it in the chat thread.</li>
                </ol>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <Bell size={16} className="text-amber-400" /> Reminders & Sound Alerts
                </h3>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                  <li>Click <strong>Enable Desktop Alerts</strong> in the top navbar to allow background notifications.</li>
                  <li>Set reminder times inside task details to get alerted before deadlines.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: GUIDELINES & BEST PRACTICES */}
          {activeTab === 'guidelines' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <h3 className="text-sm font-bold text-emerald-300 mb-1 flex items-center gap-2">
                  <Check size={16} /> Full Normal Access to All Boards
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Every team member has complete visibility across all departments and boards in the firm (Litigation, Patent, TM, Admin, Finance, etc.). You can freely browse, collaborate, and review workflows without artificial restrictions.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <h3 className="text-sm font-bold text-blue-300 mb-1 flex items-center gap-2">
                  <Check size={16} /> Continuous Real-time Synchronization
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Changes made by you or colleagues update automatically in the background. You never need to manually refresh the page to see live updates.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <h3 className="text-sm font-bold text-amber-300 mb-1 flex items-center gap-2">
                  <Check size={16} /> Security & Logging Out
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your login session is tied to your employee profile. If you are using a shared computer, please click <strong>Log out</strong> in the top right navbar when you finish your work.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400">
                <span className="text-white font-semibold">Need Help or Found an Issue?</span>
                <p className="mt-1 leading-relaxed">
                  Reach out to <strong>Pranav Bhat (Leader)</strong> or raise a query under the <strong>Queries &rarr; Admin</strong> board. You can reopen this user manual at any time by clicking the <strong>📖 Guide</strong> button in the top navbar.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 px-6 sm:px-8 py-4 border-t border-white/10 bg-black/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={dontShowAgain} 
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Don't show this popup automatically on login</span>
          </label>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Explore Workspace</span>
              <span>&rarr;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
