import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  User, Lock, Shield, Sun, Moon, Camera, Trash2, Edit2, Plus, UserPlus,
  Check, Key, Eye, EyeOff, Building2, Briefcase, RefreshCw, AlertCircle,
  Sparkles, CheckCircle2, Copy, X, ArrowRight, Calendar, MessageSquare, Send,
  Globe, ExternalLink, Link2, Download, Bell, HelpCircle
} from 'lucide-react';
import { isLeaderOrSharan, uploadFileToZohoWorkDrive } from './attachmentUtils';
import {
  getCliqConfig,
  saveCliqConfig,
  getSharedCalendarConfig,
  saveSharedCalendarConfig,
  sendCliqNotification
} from './cliqSyncUtils';
import { generateICalendar } from './calendarSyncUtils';

const PROFILES_STORAGE_KEY = 'lextria_member_profiles';

// Helper to get all stored extra profile metadata (designation, department, photoUrl)
export function getStoredProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Helper to save a member's extra profile metadata
export function saveStoredProfile(memberName, metadata) {
  try {
    const profiles = getStoredProfiles();
    const cleanKey = (memberName || '').trim().toLowerCase();
    profiles[cleanKey] = {
      ...(profiles[cleanKey] || {}),
      ...metadata,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    return profiles[cleanKey];
  } catch (e) {
    console.error('Failed to save profile metadata:', e);
    return metadata;
  }
}

export default function SettingsPage({ isAdmin = false, currentUser = null, onUpdateUser = null }) {
  // Check authorization via isLeaderOrSharan
  const isLeader = isAdmin || isLeaderOrSharan(currentUser);

  // -------------------------------------------------------------
  // THEME STATE: DARK vs LIGHT MODE
  // -------------------------------------------------------------
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('lextria_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = (newTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('lextria_theme', newTheme);
      if (newTheme === 'light') {
        document.documentElement.classList.add('theme-light');
      } else {
        document.documentElement.classList.remove('theme-light');
      }
    } catch (e) {
      console.warn('Could not persist theme:', e);
    }
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
  }, [theme]);

  // -------------------------------------------------------------
  // CURRENT USER PROFILE STATE
  // -------------------------------------------------------------
  const currentUserName = typeof currentUser === 'string' ? currentUser : currentUser?.name || '';
  const currentUserId = typeof currentUser === 'object' ? currentUser?.id : null;

  const [profileName, setProfileName] = useState(currentUserName);
  const [profilePassword, setProfilePassword] = useState(typeof currentUser === 'object' ? currentUser?.password || '' : '');
  const [profileDesignation, setProfileDesignation] = useState('');
  const [profileDepartment, setProfileDepartment] = useState('General');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  // Load existing profile metadata
  useEffect(() => {
    if (currentUserName) {
      setProfileName(currentUserName);
      const profiles = getStoredProfiles();
      const userMeta = profiles[currentUserName.trim().toLowerCase()] || {};
      if (userMeta.designation) setProfileDesignation(userMeta.designation);
      if (userMeta.department) setProfileDepartment(userMeta.department);
      if (userMeta.photoUrl) setProfilePhotoUrl(userMeta.photoUrl);
    }
    if (currentUser?.password) {
      setProfilePassword(currentUser.password);
    }
  }, [currentUserName, currentUser]);

  // Handle Photo File Pick & Convert to Base64
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Please select an image smaller than 5MB.');
      return;
    }

    // 1. Immediate local preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfilePhotoUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';

    // 2. Upload to Zoho WorkDrive
    try {
      const res = await uploadFileToZohoWorkDrive(file);
      if (res && res.url) {
        setProfilePhotoUrl(res.url);
      }
    } catch (err) {
      console.warn('Zoho WorkDrive photo upload fallback:', err);
    }
  };

  const handleRemovePhoto = () => {
    setProfilePhotoUrl('');
  };

  // Save personal profile changes
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!profileName.trim()) {
      setProfileErrorMsg('Username cannot be empty.');
      return;
    }
    if (!profilePassword.trim()) {
      setProfileErrorMsg('Password cannot be empty.');
      return;
    }

    setSavingProfile(true);
    setProfileErrorMsg('');
    setProfileSuccessMsg('');

    try {
      const cleanName = profileName.trim();
      const cleanPass = profilePassword.trim();

      // 1. Update Supabase members table so leaders are NEVER locked out!
      let memberIdToUpdate = currentUserId;

      if (!memberIdToUpdate) {
        // Look up member by current name
        const { data: found } = await supabase
          .from('members')
          .select('id')
          .ilike('name', currentUserName)
          .maybeSingle();
        if (found) memberIdToUpdate = found.id;
      }

      if (memberIdToUpdate) {
        const { error: updateErr } = await supabase
          .from('members')
          .update({
            name: cleanName,
            password: cleanPass
          })
          .eq('id', memberIdToUpdate);

        if (updateErr) {
          console.warn('Supabase member update warning:', updateErr);
        }
      }

      // Also update name on agents table if matching agent exists
      try {
        await supabase
          .from('agents')
          .update({ name: cleanName })
          .ilike('name', currentUserName);
      } catch (err) {
        console.warn('Agent table sync:', err);
      }

      // 2. Persist designation, department, and photoUrl into shared profiles
      saveStoredProfile(cleanName, {
        designation: profileDesignation.trim(),
        department: profileDepartment.trim(),
        photoUrl: profilePhotoUrl,
        password: cleanPass // Cached in emergency backup for leaders
      });
      // Also map old name to new name if name changed
      if (currentUserName.toLowerCase() !== cleanName.toLowerCase()) {
        saveStoredProfile(currentUserName, {
          designation: profileDesignation.trim(),
          department: profileDepartment.trim(),
          photoUrl: profilePhotoUrl,
          password: cleanPass
        });
      }

      // 3. Update active session in localStorage
      const updatedUserObj = {
        ...(typeof currentUser === 'object' ? currentUser : {}),
        id: memberIdToUpdate || currentUser?.id,
        name: cleanName,
        password: cleanPass,
        designation: profileDesignation.trim(),
        department: profileDepartment.trim(),
        photoUrl: profilePhotoUrl
      };
      try {
        localStorage.setItem('lextria_user_session', JSON.stringify(updatedUserObj));
      } catch {}

      if (onUpdateUser) {
        onUpdateUser(updatedUserObj);
      }

      setProfileSuccessMsg('Profile updated successfully! Leaders have immediate access to your updated credentials in case of emergency.');
      setTimeout(() => setProfileSuccessMsg(''), 4500);

      // Refresh members list for leaders
      if (isLeader) {
        fetchMembers();
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      setProfileErrorMsg(err.message || 'Failed to save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  // -------------------------------------------------------------
  // SHARED TEAM CALENDAR STATE
  // -------------------------------------------------------------
  const [sharedCalConfig, setSharedCalConfig] = useState(() => getSharedCalendarConfig());
  const [sharedCalSaved, setSharedCalSaved] = useState(false);
  const [showCalendarHelp, setShowCalendarHelp] = useState(false);

  const handleSaveSharedCalendar = (e) => {
    if (e) e.preventDefault();
    saveSharedCalendarConfig(sharedCalConfig);
    setSharedCalSaved(true);
    setTimeout(() => setSharedCalSaved(false), 3000);
  };

  // -------------------------------------------------------------
  // ZOHO CLIQ NOTIFICATIONS STATE
  // -------------------------------------------------------------
  const [cliqConfig, setCliqConfig] = useState(() => getCliqConfig());
  const [cliqSaved, setCliqSaved] = useState(false);
  const [testingCliq, setTestingCliq] = useState(false);
  const [cliqTestResult, setCliqTestResult] = useState(null);

  const handleSaveCliq = (e) => {
    if (e) e.preventDefault();
    saveCliqConfig(cliqConfig);
    setCliqSaved(true);
    setTimeout(() => setCliqSaved(false), 3000);
  };

  const handleTestCliq = async () => {
    setTestingCliq(true);
    setCliqTestResult(null);
    try {
      const result = await sendCliqNotification({
        type: 'test',
        customWebhookUrl: cliqConfig.webhookUrl,
        memberName: profileName || currentUserName || 'Team Member'
      });
      setCliqTestResult(result);
    } catch (err) {
      setCliqTestResult({ success: false, message: err.message || 'Failed to send test message to Zoho Cliq.' });
    } finally {
      setTestingCliq(false);
    }
  };

  // -------------------------------------------------------------
  // LEADER CALENDAR STATE (PRANAV BHAT & SHARAN ONLY)
  // -------------------------------------------------------------
  const [leaderCalSync, setLeaderCalSync] = useState(() => {
    try {
      const raw = localStorage.getItem('lextria_leader_ticktick_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.calendarSync || {
          googleWebhookUrl: '',
          zohoWebhookUrl: '',
          autoSyncEnabled: true
        };
      }
    } catch {}
    return { googleWebhookUrl: '', zohoWebhookUrl: '', autoSyncEnabled: true };
  });
  const [leaderCalSaved, setLeaderCalSaved] = useState(false);

  const handleSaveLeaderCalendar = (e) => {
    if (e) e.preventDefault();
    try {
      const raw = localStorage.getItem('lextria_leader_ticktick_data');
      let parsed = raw ? JSON.parse(raw) : {};
      parsed.calendarSync = {
        ...(parsed.calendarSync || {}),
        ...leaderCalSync
      };
      localStorage.setItem('lextria_leader_ticktick_data', JSON.stringify(parsed));
      setLeaderCalSaved(true);
      setTimeout(() => setLeaderCalSaved(false), 3000);
    } catch (err) {
      console.error('Error saving leader calendar sync settings:', err);
    }
  };

  const handleDownloadLeaderICS = () => {
    try {
      const raw = localStorage.getItem('lextria_leader_ticktick_data');
      const parsed = raw ? JSON.parse(raw) : {};
      const tasks = parsed.tasks || [];
      const icsData = generateICalendar(tasks);
      const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lextria-leader-tasks.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to generate calendar export: ' + (err.message || err));
    }
  };

  // -------------------------------------------------------------
  // LEADER EXCLUSIVE: TEAM MEMBERS MANAGEMENT
  // -------------------------------------------------------------
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState('');

  // Add Member State
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newPassword, setNewPassword] = useState('');
  const [newDepartment, setNewDepartment] = useState('Litigation');
  const [newDesignation, setNewDesignation] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Edit Member Modal
  const [editingMember, setEditingMember] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('member');
  const [editPassword, setEditPassword] = useState('');
  const [editDepartment, setEditDepartment] = useState('General');
  const [editDesignation, setEditDesignation] = useState('');
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);

  // Show password map for leader convenience
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const toggleRevealPassword = (memberId) => {
    setRevealedPasswords(prev => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  const fetchMembers = useCallback(async () => {
    if (!isLeader) return;
    try {
      setLoadingMembers(true);
      setMembersError('');
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching members:', err);
      setMembersError(err.message || 'Failed to load team members.');
    } finally {
      setLoadingMembers(false);
    }
  }, [isLeader]);

  useEffect(() => {
    if (isLeader) {
      fetchMembers();
    }
  }, [fetchMembers, isLeader]);

  // Leader adds new member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newPassword.trim()) return;

    try {
      setIsAddingMember(true);
      const cleanName = newName.trim();
      const cleanPass = newPassword.trim();

      const { data, error } = await supabase
        .from('members')
        .insert([{
          name: cleanName,
          role: newRole,
          password: cleanPass
        }])
        .select();

      if (error) throw error;

      // Save extra profile metadata (department, designation)
      saveStoredProfile(cleanName, {
        department: newDepartment.trim(),
        designation: newDesignation.trim(),
        password: cleanPass
      });

      setNewName('');
      setNewRole('member');
      setNewPassword('');
      setNewDesignation('');
      setNewDepartment('Litigation');
      await fetchMembers();
    } catch (err) {
      console.error('Error adding member:', err);
      alert('Failed to add member: ' + (err.message || 'Please check connection.'));
    } finally {
      setIsAddingMember(false);
    }
  };

  // Open Edit Member
  const handleOpenEdit = (member) => {
    setEditingMember(member);
    setEditName(member.name || '');
    setEditRole(member.role || 'member');
    setEditPassword(member.password || '');
    const profiles = getStoredProfiles();
    const meta = profiles[(member.name || '').trim().toLowerCase()] || {};
    setEditDepartment(meta.department || 'General');
    setEditDesignation(meta.designation || '');
  };

  // Update Member
  const handleUpdateMember = async (e) => {
    e.preventDefault();
    if (!editingMember || !editName.trim() || !editPassword.trim()) return;

    try {
      setIsUpdatingMember(true);
      const cleanName = editName.trim();
      const cleanPass = editPassword.trim();

      const { error } = await supabase
        .from('members')
        .update({
          name: cleanName,
          role: editRole,
          password: cleanPass
        })
        .eq('id', editingMember.id);

      if (error) throw error;

      saveStoredProfile(cleanName, {
        department: editDepartment.trim(),
        designation: editDesignation.trim(),
        password: cleanPass
      });

      setEditingMember(null);
      await fetchMembers();
    } catch (err) {
      console.error('Error updating member:', err);
      alert('Failed to update member: ' + (err.message || 'Please check connection.'));
    } finally {
      setIsUpdatingMember(false);
    }
  };

  // Delete Member
  const handleDeleteMember = async (id, memberName) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently remove "${memberName || 'this member'}" from the workspace?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('members').delete().eq('id', id);
      if (error) throw error;
      await fetchMembers();
    } catch (err) {
      console.error('Error removing member:', err);
      alert('Failed to remove member: ' + (err.message || 'Please check connection.'));
    }
  };

  const copyPasswordToClipboard = (pass) => {
    navigator.clipboard.writeText(pass).then(() => {
      alert('Password copied to clipboard!');
    });
  };

  // Dynamic theme colors
  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-[#0a0a0f] text-slate-100' : 'bg-[#f4f6fb] text-slate-800';
  const cardBgClass = isDark ? 'bg-[#12131a] border-white/10 shadow-2xl' : 'bg-white border-slate-200 shadow-sm';
  const subTextClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputBgClass = isDark
    ? 'bg-[#191a24] border-white/10 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600';

  return (
    <div className={`min-h-full flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar transition-colors duration-200 ${bgClass}`}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ------------------------------------------------------------- */}
        {/* HEADER & THEME TOGGLE (Dark Mode & Light Mode) */}
        {/* ------------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <span>Settings &amp; Profile</span>
              {isLeader && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Leader Portal
                </span>
              )}
            </h1>
            <p className={`text-xs md:text-sm mt-1 ${subTextClass}`}>
              Manage your personal credentials, appearance, and executive team administration.
            </p>
          </div>

          {/* Theme Selector (Dark / Light Mode) */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
            <button
              type="button"
              onClick={() => toggleTheme('dark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isDark ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]' : 'text-slate-400 hover:text-white'
              }`}
              title="Dark Mode"
            >
              <Moon size={14} /> Dark
            </button>
            <button
              type="button"
              onClick={() => toggleTheme('light')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                !isDark ? 'bg-amber-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              title="Light Mode"
            >
              <Sun size={14} /> Light
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {profileSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{profileSuccessMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {profileErrorMsg && (
          <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{profileErrorMsg}</span>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* CARD 1: PERSONAL PROFILE (Visible to Everyone) */}
        {/* ------------------------------------------------------------- */}
        <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                <User size={16} />
              </div>
              <div>
                <h2 className="text-base font-bold">Personal Profile</h2>
                <p className={`text-xs ${subTextClass}`}>Customize your identity, credentials, designation, and avatar.</p>
              </div>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              Role: <strong className="text-white capitalize">{currentUser?.role || (isLeader ? 'Leader' : 'Member')}</strong>
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Avatar & Photo Picker */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-xl bg-white/5 border border-white/5">
              <div className="relative group shrink-0">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt={profileName}
                    className="w-20 h-20 rounded-2xl object-cover shadow-xl border-2 border-blue-500/40"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white text-2xl font-extrabold shadow-xl border-2 border-white/10">
                    {profileName ? profileName.substring(0, 2).toUpperCase() : 'ME'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-medium cursor-pointer"
                  title="Change profile picture"
                >
                  <Camera size={18} />
                  <span>Change</span>
                </button>
              </div>

              <div className="flex-1 space-y-2 text-center sm:text-left">
                <h3 className="text-sm font-bold text-white">Profile Picture</h3>
                <p className={`text-xs ${subTextClass}`}>
                  Supports PNG, JPG, or WEBP up to 2MB. This picture will appear beside your tasks on your agent board.
                </p>
                <div className="flex items-center gap-2 justify-center sm:justify-start pt-1">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoSelect}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Camera size={13} /> Upload Photo
                  </button>
                  {profilePhotoUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold border border-red-500/30 transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Username Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name / Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. Mahek, Pranav Bhat"
                  required
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition ${inputBgClass}`}
                />
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showProfilePassword ? 'text' : 'password'}
                    value={profilePassword}
                    onChange={(e) => setProfilePassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className={`w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border outline-none transition ${inputBgClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowProfilePassword(!showProfilePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {showProfilePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className={`text-[10px] mt-1 ${subTextClass}`}>
                  🔒 Changes update immediately in the database so leaders can assist in emergencies.
                </p>
              </div>

              {/* Designation Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                  <Briefcase size={12} className="text-blue-400" /> Designation
                </label>
                <input
                  type="text"
                  value={profileDesignation}
                  onChange={(e) => setProfileDesignation(e.target.value)}
                  placeholder="e.g. Senior Associate, IP Counsel, Analyst"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition ${inputBgClass}`}
                />
                <p className={`text-[10px] mt-1 ${subTextClass}`}>
                  Displays below your name on your agent task board.
                </p>
              </div>

              {/* Department Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                  <Building2 size={12} className="text-blue-400" /> Department
                </label>
                <select
                  value={profileDepartment}
                  onChange={(e) => setProfileDepartment(e.target.value)}
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition ${inputBgClass}`}
                >
                  <option value="Litigation">Litigation</option>
                  <option value="Compliance">Compliance</option>
                  <option value="Patent">Patent</option>
                  <option value="Trademark">Trademark</option>
                  <option value="Copyright">Copyright</option>
                  <option value="Design">Design</option>
                  <option value="Corporate">Corporate</option>
                  <option value="General">General</option>
                </select>
                <p className={`text-[10px] mt-1 ${subTextClass}`}>
                  Your primary department tag on board cards.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-[0_0_15px_rgba(37,99,235,0.4)] transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {savingProfile ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Saving Changes...
                  </>
                ) : (
                  <>
                    <Check size={15} /> Save Profile Settings
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* SHARED TEAM CALENDAR INTEGRATION (GOOGLE / ZOHO) */}
        {/* ------------------------------------------------------------- */}
        <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-bold flex items-center gap-2 text-white">
              <Calendar size={18} className="text-cyan-400" />
              <span>Shared Team Calendar (Google / Zoho)</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowCalendarHelp(!showCalendarHelp)}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition cursor-pointer"
            >
              <HelpCircle size={14} />
              <span>{showCalendarHelp ? 'Hide Embed Guide' : 'How to get Embed Link?'}</span>
            </button>
          </div>

          <p className={`text-xs mb-4 ${subTextClass}`}>
            Connect your team's shared Google or Zoho Calendar so every member can view team schedules and deadlines directly inside the <strong>Tasks → Calendar</strong> tab.
          </p>

          {showCalendarHelp && (
            <div className="mb-5 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 space-y-2.5 animate-in fade-in">
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Globe size={14} /> Instructions to Get Your Calendar Embed Link:
              </div>
              <div className="space-y-1.5 pl-2 text-[11px] leading-relaxed">
                <div>
                  <strong className="text-white">Google Calendar:</strong> Open Google Calendar in browser → Settings → Select your shared calendar under "Settings for my calendars" → Scroll down to "Integrate calendar" → Copy the <code>Public URL to this calendar</code> or the <code>src</code> attribute from the "Embed code" (e.g. <code>https://calendar.google.com/calendar/embed?src=...</code>).
                </div>
                <div>
                  <strong className="text-white">Zoho Calendar:</strong> Open Zoho Calendar → Settings → Calendars → Click gear icon beside calendar → Share → Enable Public Access → Copy the HTML Embed code URL or Shareable Web Link.
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSaveSharedCalendar} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Calendar Provider
                </label>
                <select
                  value={sharedCalConfig.calendarType || 'google'}
                  onChange={(e) => setSharedCalConfig({ ...sharedCalConfig, calendarType: e.target.value })}
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none ${inputBgClass}`}
                >
                  <option value="google">Google Calendar</option>
                  <option value="zoho">Zoho Calendar</option>
                  <option value="custom">Other Web Calendar / iFrame</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Display Title
                </label>
                <input
                  type="text"
                  value={sharedCalConfig.title || ''}
                  onChange={(e) => setSharedCalConfig({ ...sharedCalConfig, title: e.target.value })}
                  placeholder="e.g. Lextria Team Calendar"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none ${inputBgClass}`}
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Calendar Status
                </label>
                <div className="flex items-center gap-2 py-2.5 px-3 text-xs rounded-xl bg-white/5 border border-white/5">
                  <span className={`w-2 h-2 rounded-full ${sharedCalConfig.calendarUrl ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-slate-300 font-medium">
                    {sharedCalConfig.calendarUrl ? 'Ready to Display in Tasks' : 'No Embed URL Configured'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Calendar Embed / Public Share URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={sharedCalConfig.calendarUrl || ''}
                  onChange={(e) => setSharedCalConfig({ ...sharedCalConfig, calendarUrl: e.target.value })}
                  placeholder="e.g. https://calendar.google.com/calendar/embed?src=your_calendar_id%40group.calendar.google.com&ctz=Asia%2FKolkata"
                  className={`w-full px-3.5 py-2.5 pr-20 text-xs rounded-xl border outline-none font-mono ${inputBgClass}`}
                />
                {sharedCalConfig.calendarUrl && (
                  <a
                    href={sharedCalConfig.calendarUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-semibold flex items-center gap-1 transition"
                  >
                    <ExternalLink size={10} /> Test Link
                  </a>
                )}
              </div>
              <p className={`text-[10px] mt-1 ${subTextClass}`}>
                This calendar will appear embedded in full width inside the <strong>Tasks → Calendar</strong> sub-tab for all team members.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              {sharedCalSaved ? (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Shared Calendar settings saved successfully!
                </span>
              ) : <div />}
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} /> Save Shared Calendar
              </button>
            </div>
          </form>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* ZOHO CLIQ NOTIFICATIONS INTEGRATION */}
        {/* ------------------------------------------------------------- */}
        <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-bold flex items-center gap-2 text-white">
              <MessageSquare size={18} className="text-indigo-400" />
              <span>Zoho Cliq Notifications Integration</span>
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Webhook Bot
            </span>
          </div>

          <p className={`text-xs mb-4 ${subTextClass}`}>
            Receive automated real-time alerts in your team's Zoho Cliq channel whenever members assign task deadlines, and get proactive warning messages when deadlines are near.
          </p>

          <form onSubmit={handleSaveCliq} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Zoho Cliq Incoming Webhook URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={cliqConfig.webhookUrl || ''}
                  onChange={(e) => setCliqConfig({ ...cliqConfig, webhookUrl: e.target.value })}
                  placeholder="https://cliq.zoho.com/api/v2/channelsbyname/.../incoming?zapikey=..."
                  className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border outline-none ${inputBgClass}`}
                />
                <p className={`text-[10px] mt-1 ${subTextClass}`}>
                  Obtain this from Zoho Cliq → Channel Settings → Integrations → Incoming Webhook.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Bot / Sender Name
                </label>
                <input
                  type="text"
                  value={cliqConfig.botName || 'Lextria Task Bot'}
                  onChange={(e) => setCliqConfig({ ...cliqConfig, botName: e.target.value })}
                  placeholder="Lextria Task Bot"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none ${inputBgClass}`}
                />
                <p className={`text-[10px] mt-1 ${subTextClass}`}>
                  Display name shown for notifications posted to your Zoho Cliq channel.
                </p>
              </div>
            </div>

            {/* Notification Toggles */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cliqConfig.notifyOnDeadlineSet !== false}
                  onChange={(e) => setCliqConfig({ ...cliqConfig, notifyOnDeadlineSet: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Alert on Deadline Assignment</div>
                  <div className={`text-[11px] ${subTextClass}`}>
                    Sends a Cliq message to the channel whenever a member sets or edits a due date on their task.
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer border-t border-white/5 pt-3">
                <input
                  type="checkbox"
                  checked={cliqConfig.notifyOnDeadlineNear !== false}
                  onChange={(e) => setCliqConfig({ ...cliqConfig, notifyOnDeadlineNear: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Alert on Approaching Deadline (Due Today or Within 24h)</div>
                  <div className={`text-[11px] ${subTextClass}`}>
                    Automatically checks task deadlines and alerts the member and channel when a deadline is imminent.
                  </div>
                </div>
              </label>
            </div>

            {/* Test Connection Result Alert */}
            {cliqTestResult && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                cliqTestResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                <div className="flex items-center gap-2">
                  {cliqTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{cliqTestResult.message || (cliqTestResult.success ? 'Message posted to Cliq successfully!' : 'Failed to send message.')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCliqTestResult(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestCliq}
                  disabled={testingCliq || !cliqConfig.webhookUrl}
                  className="px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-semibold border border-indigo-500/40 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Send size={13} className={testingCliq ? 'animate-bounce' : ''} />
                  {testingCliq ? 'Sending Test...' : 'Test Zoho Cliq Notification'}
                </button>
                {cliqSaved && (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Cliq settings saved!
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} /> Save Cliq Settings
              </button>
            </div>
          </form>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* CARD 2 & 3: LEADER EXECUTIVE ADMINISTRATION (PRANAV & SHARAN ONLY) */}
        {/* ------------------------------------------------------------- */}
        {isLeader && (
          <div className="space-y-6 pt-4 border-t border-white/10 animate-in fade-in">
            {/* Leader Calendar Synchronization Card (Pranav Bhat & Sharan Exclusive) */}
            <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-base font-bold flex items-center gap-2 text-white">
                  <Calendar size={18} className="text-amber-400" />
                  <span>Leader Calendar Synchronization (Pranav Bhat & Sharan Exclusive)</span>
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Shield size={11} /> Executive Only
                </span>
              </div>

              <p className={`text-xs mb-4 ${subTextClass}`}>
                Sync your personal Leader Taskboard (TickTick-style board) directly with Google Calendar and Zoho Calendar. You can configure automatic webhook dispatches or download a live RFC 5545 iCalendar (.ics) feed.
              </p>

              <form onSubmit={handleSaveLeaderCalendar} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                      <Globe size={12} className="text-amber-400" /> Google Calendar Webhook URL
                    </label>
                    <input
                      type="url"
                      value={leaderCalSync.googleWebhookUrl || ''}
                      onChange={(e) => setLeaderCalSync({ ...leaderCalSync, googleWebhookUrl: e.target.value })}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border outline-none ${inputBgClass}`}
                    />
                    <p className={`text-[10px] mt-1 ${subTextClass}`}>
                      Google Apps Script Web App endpoint to automatically create/update events in your Google Calendar.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                      <Globe size={12} className="text-amber-400" /> Zoho Calendar Webhook URL
                    </label>
                    <input
                      type="url"
                      value={leaderCalSync.zohoWebhookUrl || ''}
                      onChange={(e) => setLeaderCalSync({ ...leaderCalSync, zohoWebhookUrl: e.target.value })}
                      placeholder="https://flow.zoho.com/webhooks/incoming/..."
                      className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border outline-none ${inputBgClass}`}
                    />
                    <p className={`text-[10px] mt-1 ${subTextClass}`}>
                      Zoho Flow webhook endpoint to sync leader tasks to Zoho Calendar.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between flex-wrap gap-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={leaderCalSync.autoSyncEnabled !== false}
                      onChange={(e) => setLeaderCalSync({ ...leaderCalSync, autoSyncEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Auto-Sync on Task Updates</div>
                      <div className={`text-[11px] ${subTextClass}`}>
                        Automatically triggers background webhook sync whenever you add or edit scheduled tasks.
                      </div>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={handleDownloadLeaderICS}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40 transition cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <Download size={13} /> Export .ics Calendar File
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {leaderCalSaved ? (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Leader Calendar synchronization saved!
                    </span>
                  ) : <div />}

                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={14} /> Save Leader Calendar
                  </button>
                </div>
              </form>
            </div>

            {/* Leader Header Badge */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300">
              <div className="flex items-center gap-2.5">
                <Shield size={20} className="text-amber-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-amber-200">Executive Team Administration</h3>
                  <p className="text-xs text-amber-300/80">
                    Restricted view for Pranav Bhat and Sharan. Add new members, inspect passwords, and manage accounts.
                  </p>
                </div>
              </div>
              <button
                onClick={fetchMembers}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-amber-500/40"
                title="Refresh team directory"
              >
                <RefreshCw size={12} className={loadingMembers ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {/* Add New Member Card */}
            <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
              <h2 className="text-base font-bold mb-4 flex items-center gap-2">
                <UserPlus size={18} className="text-blue-400" />
                <span>Add Team Member</span>
              </h2>

              <form onSubmit={handleAddMember}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Akshay"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Role
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    >
                      <option value="member">Member</option>
                      <option value="leader">Leader</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Initial Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. lex123"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Department
                    </label>
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    >
                      <option value="Litigation">Litigation</option>
                      <option value="Compliance">Compliance</option>
                      <option value="Patent">Patent</option>
                      <option value="Trademark">Trademark</option>
                      <option value="Corporate">Corporate</option>
                      <option value="General">General</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Associate"
                      value={newDesignation}
                      onChange={(e) => setNewDesignation(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isAddingMember}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    {isAddingMember ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>

            {/* Team Members Directory Card */}
            <div className={`rounded-2xl border overflow-hidden transition-all ${cardBgClass}`}>
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <span>Active Team Directory</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {members.length} {members.length === 1 ? 'Account' : 'Accounts'}
                    </span>
                  </h2>
                  <p className={`text-xs mt-0.5 ${subTextClass}`}>
                    All accounts and passwords visible to leaders to guarantee zero emergency lockout.
                  </p>
                </div>
              </div>

              {loadingMembers ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-blue-400" /> Loading team members...
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No member records found.
                </div>
              ) : (
                <div className="divide-y divide-white/5 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Member</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Designation</th>
                        <th className="px-4 py-3">Password (Emergency Access)</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {members.map((member) => {
                        const profiles = getStoredProfiles();
                        const meta = profiles[(member.name || '').trim().toLowerCase()] || {};
                        const isPassRevealed = Boolean(revealedPasswords[member.id]);
                        const isYou = member.name?.toLowerCase() === currentUserName.toLowerCase();

                        return (
                          <tr key={member.id} className="hover:bg-white/5 transition-colors">
                            {/* Member info with avatar */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                {meta.photoUrl ? (
                                  <img
                                    src={meta.photoUrl}
                                    alt={member.name}
                                    className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-300 font-bold flex items-center justify-center shrink-0 border border-white/10">
                                    {(member.name || 'U').substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-white flex items-center gap-1.5">
                                    <span>{member.name}</span>
                                    {isYou && (
                                      <span className="text-[10px] text-blue-400 font-normal">(you)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="px-4 py-3.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                member.role === 'leader'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                              }`}>
                                {member.role || 'member'}
                              </span>
                            </td>

                            {/* Department */}
                            <td className="px-4 py-3.5 text-slate-300">
                              {meta.department || 'General'}
                            </td>

                            {/* Designation */}
                            <td className="px-4 py-3.5 text-slate-300">
                              {meta.designation || '—'}
                            </td>

                            {/* Current Password with copy & reveal */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1 w-fit font-mono text-[11px]">
                                <Key size={12} className="text-amber-400 shrink-0" />
                                <span className="select-all">
                                  {isPassRevealed ? (member.password || '—') : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleRevealPassword(member.id)}
                                  className="text-slate-400 hover:text-white ml-1 transition cursor-pointer"
                                  title={isPassRevealed ? 'Hide Password' : 'Show Password'}
                                >
                                  {isPassRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                                {member.password && (
                                  <button
                                    type="button"
                                    onClick={() => copyPasswordToClipboard(member.password)}
                                    className="text-slate-400 hover:text-blue-400 ml-0.5 transition cursor-pointer"
                                    title="Copy Password"
                                  >
                                    <Copy size={12} />
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(member)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Edit Member"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMember(member.id, member.name)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                                  title="Remove Member"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ------------------------------------------------------------- */}
      {/* EDIT MEMBER MODAL (LEADER ONLY) */}
      {/* ------------------------------------------------------------- */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl relative ${cardBgClass}`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Edit2 size={16} className="text-blue-400" /> Edit Member Credentials
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateMember} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-300 mb-1">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                >
                  <option value="member">Member</option>
                  <option value="leader">Leader</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-300 mb-1">Password</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  required
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-300 mb-1">Department</label>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                >
                  <option value="Litigation">Litigation</option>
                  <option value="Compliance">Compliance</option>
                  <option value="Patent">Patent</option>
                  <option value="Trademark">Trademark</option>
                  <option value="Corporate">Corporate</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-300 mb-1">Designation</label>
                <input
                  type="text"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  placeholder="e.g. Associate"
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingMember}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingMember ? 'Updating...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
