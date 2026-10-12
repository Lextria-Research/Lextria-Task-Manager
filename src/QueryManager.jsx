import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import QueryTickets from './QueryTickets';
import ExportPage from './ExportPage';
import SettingsPage from './SettingsPage';

function HubLogo({ size = 32 }) {
  return (
    <img
      src="/logo.png"
      alt="Lextria Logo"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover border border-white/20 shadow-sm"
    />
  );
}

const TABS = [
  { id: 'tickets', label: 'Query Tickets' },
  { id: 'export', label: 'Export' },
];

export default function QueryManager({ agents = [], isAdmin = false, currentUser = null, onLogout = null }) {
  const [session, setSession] = useState(() => {
    if (currentUser) return currentUser;
    try {
      const saved = localStorage.getItem('lextria_user_session') || localStorage.getItem('lextria_query_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Keep session in sync with currentUser if passed from parent
  useEffect(() => {
    if (currentUser) {
      setSession(currentUser);
    }
  }, [currentUser]);

  const [activeSubTab, setActiveSubTab] = useState('tickets'); // 'tickets' | 'projects' | 'export' | 'settings'
  
  // Login form state (fallback if rendered standalone)
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  // Load members from Supabase for fallback login
  useEffect(() => {
    if (!session) {
      fetchMembers();
    }
  }, [session]);

  const fetchMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMembers(data);
        if (data.length > 0 && !selectedMemberId) {
          setSelectedMemberId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    const member = members.find(m => m.id === selectedMemberId);
    if (!member) {
      setLoginError('Please select a team member.');
      setIsLoggingIn(false);
      return;
    }

    if (member.password && member.password !== loginPassword) {
      setLoginError('Incorrect password. Please try again.');
      setIsLoggingIn(false);
      return;
    }

    const sessionData = {
      id: member.id,
      name: member.name,
      role: member.role || 'member',
    };

    localStorage.setItem('lextria_user_session', JSON.stringify(sessionData));
    localStorage.setItem('lextria_query_session', JSON.stringify(sessionData));
    setSession(sessionData);
    setIsLoggingIn(false);
    setLoginPassword('');
  };

  const handleSeedLeader = async () => {
    setIsLoggingIn(true);
    try {
      const { data, error } = await supabase
        .from('members')
        .insert([{
          name: 'Pranav Bhat',
          role: 'leader',
          password: '334'
        }])
        .select();

      if (!error && data && data.length > 0) {
        const newLeader = data[0];
        setMembers([newLeader]);
        setSelectedMemberId(newLeader.id);
        const sessionData = {
          id: newLeader.id,
          name: newLeader.name,
          role: newLeader.role,
        };
        localStorage.setItem('lextria_user_session', JSON.stringify(sessionData));
        localStorage.setItem('lextria_query_session', JSON.stringify(sessionData));
        setSession(sessionData);
      } else {
        alert('Could not initialize leader. Make sure the "members" table was created in Supabase SQL.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }
    localStorage.removeItem('lextria_user_session');
    localStorage.removeItem('lextria_query_session');
    setSession(null);
    setActiveSubTab('tickets');
    fetchMembers();
  };

  const currentSession = session || currentUser;
  const isLeader = currentSession?.role === 'leader' || isAdmin;

  // --- 1. FALLBACK LOGIN SCREEN (only if no session anywhere) ---
  if (!currentSession) {
    return (
      <div className="flex-1 min-h-[85vh] flex items-center justify-center p-4 bg-[#f4f5f7]">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center flex flex-col items-center">
            <HubLogo size={48} />
            <h1 className="text-2xl font-bold text-slate-900 mt-3">Query Manager</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to manage query tickets &amp; reports</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {members.length === 0 && !isLoadingMembers ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-600 mb-4">
                  No members found in the system yet.
                </p>
                <button
                  type="button"
                  onClick={handleSeedLeader}
                  disabled={isLoggingIn}
                  className="w-full rounded-lg bg-[#16234f] hover:bg-[#1f3169] px-4 py-2.5 text-sm font-semibold text-white transition shadow-sm cursor-pointer"
                >
                  {isLoggingIn ? 'Setting up…' : 'Initialize as Pranav Bhat (Leader)'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin}>
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Your name</label>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    disabled={isLoadingMembers}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#16234f]"
                  >
                    {isLoadingMembers && <option>Loading members…</option>}
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                  <input
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    type="password"
                    required
                    placeholder="Enter password"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16234f]"
                  />
                </div>

                {loginError && (
                  <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn || !selectedMemberId}
                  className="w-full rounded-lg bg-[#16234f] hover:bg-[#1f3169] px-3 py-2.5 text-sm font-semibold text-white transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isLoggingIn ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- 2. AUTHENTICATED TEAM HUB ---
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f4f5f7]">
      {/* Sub-Navigation Bar */}
      <header className="border-b-2 border-[#c9a227] bg-[#16234f] text-white shadow-sm shrink-0">
        <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
          {/* Sub-Navigation Tabs */}
          <nav className="flex gap-1 overflow-x-auto pb-0.5">
            {TABS.map((tab) => {
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-[#c9a227] text-[#16234f] shadow-sm'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            {isLeader && (
              <button
                onClick={() => setActiveSubTab('settings')}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                  activeSubTab === 'settings'
                    ? 'bg-[#c9a227] text-[#16234f] shadow-sm'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                Settings
              </button>
            )}
          </nav>

          {/* User badge & Logout */}
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden sm:inline text-sm text-slate-200">
              {currentSession.name}{' '}
              <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium capitalize text-[#e6c766]">
                {currentSession.role || 'member'}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-lg border border-white/25 px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Sub-Page Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {activeSubTab === 'tickets' && (
          <QueryTickets session={currentSession} agents={agents} />
        )}
        {activeSubTab === 'export' && (
          <ExportPage />
        )}
        {activeSubTab === 'settings' && isLeader && (
          <SettingsPage isAdmin={isLeader} currentUser={currentSession} />
        )}
      </div>
    </div>
  );
}
