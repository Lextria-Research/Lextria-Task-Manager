import React, { useState } from 'react';
import { supabase, centralSupabase } from './supabaseClient';
import { Lock, User, AlertCircle, Loader2, ShieldCheck, Mail, Eye, EyeOff } from 'lucide-react';

export default function LoginPage({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanInput = identifier.trim();
    if (!cleanInput) {
      setError('Please enter your Universal Email or Username.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      // -------------------------------------------------------------
      // 1. ATTEMPT UNIVERSAL AUTH VIA CENTRAL SUPABASE (eafciegebhuhoneypsqy)
      // -------------------------------------------------------------
      let authEmail = cleanInput.includes('@') ? cleanInput.toLowerCase() : null;

      // If user typed display name instead of email, look up email in core.profiles
      if (!authEmail) {
        try {
          const { data: profileMatch } = await centralSupabase
            .schema('core')
            .from('profiles')
            .select('email, display_name, role, active')
            .ilike('display_name', cleanInput)
            .maybeSingle();

          if (profileMatch && profileMatch.email) {
            authEmail = profileMatch.email;
          }
        } catch (lookupErr) {
          console.warn('Central profile lookup warning:', lookupErr);
        }
      }

      // If we have an email, attempt central Supabase Auth
      if (authEmail) {
        try {
          const { data: authResult, error: authErr } = await centralSupabase.auth.signInWithPassword({
            email: authEmail,
            password: password,
          });

          if (!authErr && authResult?.user) {
            const authUser = authResult.user;
            const meta = authUser.user_metadata || {};
            const dashAccess = meta.dashboard_access || {};

            // Check if user has active profile in core.profiles
            const { data: userProfile } = await centralSupabase
              .schema('core')
              .from('profiles')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();

            const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
            const tmAccess = dashAccess.task_manager || {};

            // Check if user has permission for Task Manager
            if (!isSuperAdmin && tmAccess.enabled === false) {
              setError('Access to Task Manager is not enabled for your account. Please contact an Administrator.');
              setLoading(false);
              return;
            }

            const isLeader = isSuperAdmin || tmAccess.role === 'leader' || userProfile?.role === 'DEPT_ADMIN';

            const universalUserSession = {
              id: authUser.id,
              name: userProfile?.display_name || meta.display_name || cleanInput,
              email: authUser.email,
              role: isLeader ? 'leader' : 'member',
              department: userProfile?.department || meta.department || 'Litigation',
              designation: meta.designation || '',
              password: password,
              isUniversal: true,
              coreProfile: userProfile,
              dashboardAccess: dashAccess,
            };

            onLogin(universalUserSession);
            return;
          }
        } catch (centralAuthErr) {
          console.warn('Central auth sign-in warning:', centralAuthErr);
        }
      }

      // -------------------------------------------------------------
      // 2. FALLBACK TO TASK MANAGER LOCAL MEMBERS TABLE
      // -------------------------------------------------------------
      const { data: allMembers, error: listErr } = await supabase
        .from('members')
        .select('*');

      if (listErr) {
        throw listErr;
      }

      // Auto-seed Pranav Bhat if database is completely empty
      if (!allMembers || allMembers.length === 0) {
        if (cleanInput.toLowerCase() === 'pranav bhat' || cleanInput.toLowerCase() === 'pranav' || cleanInput.toLowerCase() === 'pranavbhat@lextria.in') {
          const { data: seeded, error: seedErr } = await supabase
            .from('members')
            .insert([{
              name: 'Pranav Bhat',
              role: 'leader',
              password: password || '334'
            }])
            .select();

          if (seedErr) throw seedErr;
          if (seeded && seeded.length > 0) {
            onLogin(seeded[0]);
            return;
          }
        } else {
          setError('No users found in the system yet. Please have Leader Pranav Bhat sign in first.');
          setLoading(false);
          return;
        }
      }

      // Find member by name (case-insensitive and space-flexible)
      const matched = allMembers.find(
        (m) => m.name && (
          m.name.trim().toLowerCase() === cleanInput.toLowerCase() ||
          m.name.replace(/\s+/g, '').toLowerCase() === cleanInput.replace(/\s+/g, '').toLowerCase()
        )
      );

      if (!matched) {
        setError(`User "${cleanInput}" not found. Please contact Administrator Pranav Bhat to create your universal account.`);
        setLoading(false);
        return;
      }

      // Verify password against legacy members table
      if (matched.password !== password) {
        setError('Incorrect password. Please try again.');
        setLoading(false);
        return;
      }

      // Successful legacy login
      onLogin(matched);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Could not reach database. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0a0a1a] relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in duration-300">
        {/* Header Branding */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src="/logo.png"
            alt="Lextria Logo"
            className="w-16 h-16 rounded-full object-cover shadow-2xl border-2 border-white/20 mb-4"
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Lextria Task &amp; Query Manager
          </h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium">
            <ShieldCheck size={13} className="text-blue-400" />
            <span>Universal Ecosystem Authentication</span>
          </div>
          <p className="text-slate-400 text-xs mt-2">
            Use your firm Universal Email or Username to sign in
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#121629]/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Universal Email or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  {identifier.includes('@') ? <Mail size={16} /> : <User size={16} />}
                </div>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. pranavbhat@lextria.in or Pranav Bhat"
                  className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-red-300 text-xs animate-in fade-in">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-600/20 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In to Workspace</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Lextria Ecosystem &bull; Central Single Sign-On
        </p>
      </div>
    </div>
  );
}
