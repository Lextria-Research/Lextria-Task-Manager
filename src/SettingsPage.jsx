import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, centralSupabase } from './supabaseClient';
import {
  User, Lock, Shield, Sun, Moon, Camera, Trash2, Edit2, Plus, UserPlus,
  Check, Key, Eye, EyeOff, Building2, Briefcase, RefreshCw, AlertCircle,
  Sparkles, CheckCircle2, Copy, X, ArrowRight, Calendar, MessageSquare, Send,
  Globe, ExternalLink, Link2, Download, Bell, HelpCircle, Volume2, VolumeX, Play,
  Layers, Scale, FileText, DollarSign, Laptop, Users, ShieldCheck, Mail, CheckSquare,
  Search, Filter, Phone, MapPin, CreditCard, Building
} from 'lucide-react';
import {
  getPatentSoundEnabled,
  setPatentSoundEnabled,
  playPatentNotificationSound
} from './PatentFiling/patentNotifications';
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

  // Patent Filing Notification Sounds & Desktop Alerts
  const [patentSoundEnabled, setPatentSoundEnabledState] = useState(() => {
    return getPatentSoundEnabled(currentUser?.id || currentUserName);
  });
  const [desktopPermission, setDesktopPermission] = useState(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });

  const handleTogglePatentSound = () => {
    const nextVal = !patentSoundEnabled;
    setPatentSoundEnabledState(nextVal);
    setPatentSoundEnabled(currentUser?.id || currentUserName, nextVal);
  };

  const handleTestFilerSound = () => {
    playPatentNotificationSound('filer', currentUser?.id || currentUserName);
  };

  const handleTestAuditorSound = () => {
    playPatentNotificationSound('auditor', currentUser?.id || currentUserName);
  };

  const handleRequestDesktopPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(perm => {
        setDesktopPermission(perm);
      });
    }
  };

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
  // LEADER EXCLUSIVE: UNIVERSAL TEAM & DASHBOARD ACCESS MANAGEMENT
  // -------------------------------------------------------------
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState('');

  // Universal Users State (eafciegebhuhoneypsqy central profiles)
  const [universalUsers, setUniversalUsers] = useState([]);
  const [loadingUniversal, setLoadingUniversal] = useState(false);
  const [universalError, setUniversalError] = useState('');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');

  // Leader sub-navigation: 'members' | 'clients'
  const [activeLeaderSubTab, setActiveLeaderSubTab] = useState('members');

  // Central Clients State (core.clients in eafciegebhuhoneypsqy)
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientTypeFilter, setClientTypeFilter] = useState('ALL');

  // Add Client Modal State
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientCode, setNewClientCode] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientEntityType, setNewClientEntityType] = useState('COMPANY');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientGstin, setNewClientGstin] = useState('');
  const [newClientPan, setNewClientPan] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientPortalAccess, setNewClientPortalAccess] = useState(false);
  const [newClientPortalPassword, setNewClientPortalPassword] = useState('');
  const [isAddingClient, setIsAddingClient] = useState(false);

  // Edit Client Modal State
  const [editingClient, setEditingClient] = useState(null);
  const [editClientCode, setEditClientCode] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientEntityType, setEditClientEntityType] = useState('COMPANY');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientGstin, setEditClientGstin] = useState('');
  const [editClientPan, setEditClientPan] = useState('');
  const [editClientAddress, setEditClientAddress] = useState('');
  const [editClientPortalAccess, setEditClientPortalAccess] = useState(false);
  const [editClientPortalPassword, setEditClientPortalPassword] = useState('');
  const [isUpdatingClient, setIsUpdatingClient] = useState(false);

  // Fetch clients from central database / API
  const fetchClients = useCallback(async () => {
    if (!isLeader) return;
    try {
      setLoadingClients(true);
      setClientsError('');
      const res = await fetch('/api/clients');
      if (res.ok) {
        const json = await res.json();
        setClients(json.clients || []);
        return;
      }
      throw new Error(`API returned ${res.status}`);
    } catch (err) {
      console.warn('API /api/clients fallback to direct central Supabase:', err);
      try {
        const { data, error } = await centralSupabase
          .schema('core')
          .from('clients')
          .select('*')
          .order('client_name', { ascending: true });
        if (data) setClients(data.map(c => ({ ...c, portalAccess: false })));
        if (error) throw error;
      } catch (fbErr) {
        setClientsError('Failed to load central clients: ' + (err.message || 'Check connection'));
      }
    } finally {
      setLoadingClients(false);
    }
  }, [isLeader]);

  // Handle Add New Client
  const handleAddClient = async (e) => {
    e.preventDefault();
    if (!newClientCode.trim() || !newClientName.trim()) {
      alert('Client Code and Client Name are required.');
      return;
    }

    try {
      setIsAddingClient(true);
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_code: newClientCode.trim().toUpperCase(),
          client_name: newClientName.trim(),
          entity_type: newClientEntityType,
          email: newClientEmail.trim() || undefined,
          phone: newClientPhone.trim() || undefined,
          gstin: newClientGstin.trim() || undefined,
          pan: newClientPan.trim() || undefined,
          billing_address: newClientAddress.trim() || undefined,
          portal_access: newClientPortalAccess,
          portal_password: newClientPortalPassword.trim() || undefined,
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add client');

      setShowAddClientModal(false);
      setNewClientCode('');
      setNewClientName('');
      setNewClientEmail('');
      setNewClientPhone('');
      setNewClientGstin('');
      setNewClientPan('');
      setNewClientAddress('');
      setNewClientPortalAccess(false);
      setNewClientPortalPassword('');

      await fetchClients();
      alert(`Client "${json.client?.client_name || newClientName}" registered successfully!`);
    } catch (err) {
      console.error('Error adding client:', err);
      alert('Failed to register client: ' + (err.message || 'Please check connection.'));
    } finally {
      setIsAddingClient(false);
    }
  };

  // Open Edit Client Modal
  const handleOpenEditClient = (c) => {
    setEditingClient(c);
    setEditClientCode(c.client_code || '');
    setEditClientName(c.client_name || '');
    setEditClientEntityType(c.entity_type || 'COMPANY');
    setEditClientEmail(c.email || '');
    setEditClientPhone(c.phone || '');
    setEditClientGstin(c.gstin || '');
    setEditClientPan(c.pan || '');
    setEditClientAddress(c.billing_address || '');
    setEditClientPortalAccess(Boolean(c.portalAccess));
    setEditClientPortalPassword('');
  };

  // Handle Update Client
  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!editingClient || !editClientName.trim()) return;

    try {
      setIsUpdatingClient(true);
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingClient.id,
          client_code: editClientCode.trim().toUpperCase(),
          client_name: editClientName.trim(),
          entity_type: editClientEntityType,
          email: editClientEmail.trim() || undefined,
          phone: editClientPhone.trim() || undefined,
          gstin: editClientGstin.trim() || undefined,
          pan: editClientPan.trim() || undefined,
          billing_address: editClientAddress.trim() || undefined,
          portal_access: editClientPortalAccess,
          portal_password: editClientPortalPassword.trim() || undefined,
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update client');

      setEditingClient(null);
      await fetchClients();
      alert('Client details and portal access updated successfully!');
    } catch (err) {
      console.error('Error updating client:', err);
      alert('Failed to update client: ' + (err.message || 'Please check connection.'));
    } finally {
      setIsUpdatingClient(false);
    }
  };

  // Handle Delete Client
  const handleDeleteClient = async (c) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete client "${c.client_code} - ${c.client_name}"?\n\nNote: Clients with active project codes/matters cannot be deleted.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete client');

      await fetchClients();
      alert(`Client "${c.client_name}" removed successfully.`);
    } catch (err) {
      console.error('Error deleting client:', err);
      alert('Cannot delete client: ' + (err.message || 'Please check connection.'));
    }
  };

  // Add Universal Member State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newPassword, setNewPassword] = useState('');
  const [newDepartment, setNewDepartment] = useState('Litigation');
  const [newDesignation, setNewDesignation] = useState('');
  const [newDashAccess, setNewDashAccess] = useState({
    task_manager: { enabled: true, role: 'member' },
    litigator: { enabled: false, role: 'ASSOCIATE' },
    patent: { enabled: false, role: 'DRAFTER' },
    finance: { enabled: false, mode: 'NONE' }, // 'FULL' | 'EXECUTIVE' | 'NONE'
    client_portal: { enabled: false, clientId: '' }
  });
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Edit Universal Member Modal
  const [editingMember, setEditingMember] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('member');
  const [editPassword, setEditPassword] = useState('');
  const [editDepartment, setEditDepartment] = useState('General');
  const [editDesignation, setEditDesignation] = useState('');
  const [editDashAccess, setEditDashAccess] = useState({
    task_manager: { enabled: true, role: 'member' },
    litigator: { enabled: false, role: 'ASSOCIATE' },
    patent: { enabled: false, role: 'DRAFTER' },
    finance: { enabled: false, mode: 'NONE' },
    client_portal: { enabled: false, clientId: '' }
  });
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);

  // Show password map for leader convenience
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const toggleRevealPassword = (memberId) => {
    setRevealedPasswords(prev => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  // Fetch local task members
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

  // Fetch universal profiles from central Supabase / API
  const fetchUniversalUsers = useCallback(async () => {
    if (!isLeader) return;
    try {
      setLoadingUniversal(true);
      setUniversalError('');
      const res = await fetch('/api/users');
      if (res.ok) {
        const json = await res.json();
        setUniversalUsers(json.users || []);
        return;
      }
      throw new Error(`API returned ${res.status}`);
    } catch (err) {
      console.warn('API /api/users fetch fallback:', err);
      try {
        const { data: profs } = await centralSupabase
          .schema('core')
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true });

        if (profs) {
          setUniversalUsers(profs.map(p => ({
            id: p.id,
            email: p.email,
            displayName: p.display_name,
            role: p.role,
            department: p.department,
            active: p.active,
            createdAt: p.created_at,
            dashboardAccess: {
              task_manager: { enabled: true, role: p.role === 'SUPER_ADMIN' ? 'leader' : 'member' },
              litigator: { enabled: p.department === 'LITIGATION' || p.role === 'SUPER_ADMIN', role: p.role === 'SUPER_ADMIN' ? 'LITIGATION_HEAD' : 'ASSOCIATE' },
              patent: { enabled: p.department === 'IP_PATENT' || p.role === 'SUPER_ADMIN', role: p.role === 'SUPER_ADMIN' ? 'ADMIN' : 'DRAFTER' },
              finance: { enabled: p.department === 'FINANCE' || p.role === 'SUPER_ADMIN', mode: p.role === 'SUPER_ADMIN' ? 'FULL' : 'NONE' },
              client_portal: { enabled: false, clientId: '' }
            }
          })));
        }
      } catch (fbErr) {
        setUniversalError(err.message || 'Failed to fetch universal users.');
      }
    } finally {
      setLoadingUniversal(false);
    }
  }, [isLeader]);

  useEffect(() => {
    if (isLeader) {
      fetchMembers();
      fetchUniversalUsers();
      fetchClients();
    }
  }, [fetchMembers, fetchUniversalUsers, fetchClients, isLeader]);

  // Generate strong random password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Lx!';
    for (let i = 0; i < 9; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  // Leader adds new universal member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      alert('Please enter Full Name.');
      return;
    }

    const cleanName = newName.trim();
    const cleanEmail = newEmail.trim() || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@lextria.in`;
    const cleanPass = newPassword.trim() || generateRandomPassword();

    try {
      setIsAddingMember(true);

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: cleanName,
          email: cleanEmail,
          password: cleanPass,
          role: newRole === 'leader' ? 'SUPER_ADMIN' : 'STAFF',
          department: newDepartment,
          designation: newDesignation.trim(),
          dashboardAccess: newDashAccess
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create universal user');

      saveStoredProfile(cleanName, {
        department: newDepartment.trim(),
        designation: newDesignation.trim(),
        password: cleanPass
      });

      setNewName('');
      setNewEmail('');
      setNewRole('member');
      setNewPassword('');
      setNewDesignation('');
      setNewDepartment('Litigation');
      setNewDashAccess({
        task_manager: { enabled: true, role: 'member' },
        litigator: { enabled: false, role: 'ASSOCIATE' },
        patent: { enabled: false, role: 'DRAFTER' },
        finance: { enabled: false, mode: 'NONE' },
        client_portal: { enabled: false, clientId: '' }
      });

      await fetchUniversalUsers();
      await fetchMembers();
      alert(`Universal account created successfully for ${cleanName}!\nLogin Email: ${cleanEmail}\nPassword: ${cleanPass}`);
    } catch (err) {
      console.error('Error adding universal member:', err);
      alert('Failed to add universal member: ' + (err.message || 'Please check connection.'));
    } finally {
      setIsAddingMember(false);
    }
  };

  // Open Edit Universal Member
  const handleOpenEdit = (user) => {
    setEditingMember(user);
    setEditName(user.displayName || user.name || '');
    setEditEmail(user.email || '');
    setEditRole(user.role === 'SUPER_ADMIN' || user.role === 'leader' ? 'leader' : 'member');
    setEditPassword(user.cachedPassword || user.password || '');
    setEditDepartment(user.department || 'Litigation');
    setEditDesignation(user.designation || '');
    setEditDashAccess(user.dashboardAccess || {
      task_manager: { enabled: true, role: 'member' },
      litigator: { enabled: false, role: 'ASSOCIATE' },
      patent: { enabled: false, role: 'DRAFTER' },
      finance: { enabled: false, mode: 'NONE' },
      client_portal: { enabled: false, clientId: '' }
    });
  };

  // Update Universal Member
  const handleUpdateMember = async (e) => {
    e.preventDefault();
    if (!editingMember || !editName.trim()) return;

    try {
      setIsUpdatingMember(true);
      const cleanName = editName.trim();
      const cleanEmail = editEmail.trim();
      const cleanPass = editPassword.trim();

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingMember.id,
          displayName: cleanName,
          email: cleanEmail,
          password: cleanPass || undefined,
          role: editRole === 'leader' ? 'SUPER_ADMIN' : 'STAFF',
          department: editDepartment,
          designation: editDesignation.trim(),
          dashboardAccess: editDashAccess
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update user');

      saveStoredProfile(cleanName, {
        department: editDepartment.trim(),
        designation: editDesignation.trim(),
        password: cleanPass
      });

      setEditingMember(null);
      await fetchUniversalUsers();
      await fetchMembers();
      alert('Universal user account and dashboard permissions updated successfully!');
    } catch (err) {
      console.error('Error updating member:', err);
      alert('Failed to update member: ' + (err.message || 'Please check connection.'));
    } finally {
      setIsUpdatingMember(false);
    }
  };

  // Delete / Deactivate Member
  const handleDeleteMember = async (id, memberName) => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate universal account for "${memberName || 'this member'}" across all dashboards?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, displayName: memberName })
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete');
      }

      await fetchUniversalUsers();
      await fetchMembers();
    } catch (err) {
      console.error('Error removing member:', err);
      alert('Failed to remove member: ' + (err.message || 'Please check connection.'));
    }
  };

  // One-click Sync All Legacy Members to Universal SSO
  const handleSyncLegacyMembers = async () => {
    const confirmed = window.confirm(
      `This will sync and provision all ${members.length} team members from Task Manager into the Central Universal Directory (core.profiles) with @lextria.in emails and their existing passwords. Ready to proceed?`
    );
    if (!confirmed) return;

    setIsSyncingAll(true);
    setSyncStatusMsg('Starting synchronization...');
    let successCount = 0;
    let skippedCount = 0;

    try {
      const existingEmails = new Set((universalUsers || []).map(u => (u.email || '').toLowerCase()));
      const existingNames = new Set((universalUsers || []).map(u => (u.displayName || u.name || '').toLowerCase()));

      for (const member of members) {
        const cleanName = (member.name || '').trim();
        if (!cleanName) continue;

        if (existingNames.has(cleanName.toLowerCase())) {
          skippedCount++;
          continue;
        }

        const cleanFirst = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const email = `${cleanFirst}@lextria.in`;
        if (existingEmails.has(email)) {
          skippedCount++;
          continue;
        }

        setSyncStatusMsg(`Provisioning ${cleanName} (${email})...`);

        const profiles = getStoredProfiles();
        const meta = profiles[cleanName.toLowerCase()] || {};
        const dept = meta.department || 'Litigation';
        const designation = meta.designation || '';
        const isLead = member.role === 'leader';

        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: cleanName,
            email,
            password: member.password || 'Lextria@334',
            role: isLead ? 'SUPER_ADMIN' : 'STAFF',
            department: dept === 'Patent' ? 'IP_PATENT' : dept === 'Litigation' ? 'LITIGATION' : dept === 'Finance' ? 'FINANCE' : 'MANAGEMENT',
            designation,
            dashboardAccess: {
              task_manager: { enabled: true, role: isLead ? 'leader' : 'member' },
              litigator: { enabled: dept === 'Litigation' || isLead, role: isLead ? 'LITIGATION_HEAD' : 'ASSOCIATE' },
              patent: { enabled: dept === 'Patent' || isLead, role: isLead ? 'ADMIN' : 'DRAFTER' },
              finance: { enabled: dept === 'Finance' || isLead, mode: isLead ? 'FULL' : 'NONE' },
              client_portal: { enabled: false, clientId: '' }
            }
          })
        });

        successCount++;
      }

      setSyncStatusMsg(`Successfully provisioned ${successCount} members to Universal Directory! (${skippedCount} already existed)`);
      await fetchUniversalUsers();
      await fetchMembers();
      setTimeout(() => setSyncStatusMsg(''), 7000);
    } catch (err) {
      console.error('Sync legacy error:', err);
      alert('Sync error: ' + err.message);
    } finally {
      setIsSyncingAll(false);
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
        {/* PATENT FILING NOTIFICATION SOUNDS & DESKTOP ALERTS */}
        {/* ------------------------------------------------------------- */}
        <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-bold flex items-center gap-2 text-white">
              <Volume2 size={18} className="text-brand-400" />
              <span>Patent Filing Notification Sounds & Alerts</span>
            </h2>
            <button
              type="button"
              onClick={handleTogglePatentSound}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border ${
                patentSoundEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              }`}
            >
              {patentSoundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>{patentSoundEnabled ? 'Sound: ON' : 'Sound: OFF'}</span>
            </button>
          </div>

          <p className={`text-xs mb-4 ${subTextClass}`}>
            Customize assignment pop-ups and full-volume sound alerts when Mounisha assigns or reassigns a patent filing to you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Test Filer Sound */}
            <div className="p-3.5 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Filer Notification Sound</div>
                <div className="text-[11px] text-slate-400">Air horn sound (played for Assignee)</div>
              </div>
              <button
                type="button"
                onClick={handleTestFilerSound}
                className="px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play size={12} /> Test Sound
              </button>
            </div>

            {/* Test Auditor Sound */}
            <div className="p-3.5 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Auditor Notification Sound</div>
                <div className="text-[11px] text-slate-400">Doorbell sound (played for Auditor)</div>
              </div>
              <button
                type="button"
                onClick={handleTestAuditorSound}
                className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play size={12} /> Test Sound
              </button>
            </div>
          </div>

          {/* Desktop Notifications Status & Re-enable Hint */}
          <div className="p-3.5 rounded-xl border border-white/10 bg-white/5 text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-semibold text-white flex items-center gap-2">
                <Bell size={14} className="text-cyan-400" /> Desktop (OS) Notifications:
              </span>
              {desktopPermission === 'granted' && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle2 size={12} /> Active
                </span>
              )}
              {desktopPermission === 'denied' && (
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-semibold text-[11px] flex items-center gap-1">
                  <AlertCircle size={12} /> Blocked in Browser
                </span>
              )}
              {desktopPermission === 'default' && (
                <button
                  type="button"
                  onClick={handleRequestDesktopPermission}
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold text-[11px] hover:bg-cyan-500/30 transition cursor-pointer"
                >
                  Enable Desktop Alerts
                </button>
              )}
            </div>
            {desktopPermission === 'denied' && (
              <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg mt-1">
                <strong>How to re-enable:</strong> Notifications are blocked in your browser. Click the padlock or site settings icon next to the URL in your browser address bar and change Notifications permission to <em>Allow</em>.
              </div>
            )}
          </div>
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-blue-500/10 to-indigo-500/10 border border-amber-500/30 text-amber-300">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={22} className="text-amber-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Universal Ecosystem User Administration</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold border border-blue-500/30">
                      Central SSO
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Manage universal login IDs, passwords, and permissions across Task Manager, Litigator, Patent, Finance, and Client Portals.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSyncLegacyMembers}
                  disabled={isSyncingAll}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-emerald-500/40 disabled:opacity-50"
                  title="One-click sync existing Task Manager members into Universal Central Directory"
                >
                  <RefreshCw size={12} className={isSyncingAll ? 'animate-spin' : ''} />
                  {isSyncingAll ? 'Syncing Team...' : 'Sync 27 Legacy Members'}
                </button>

                <button
                  type="button"
                  onClick={() => { fetchUniversalUsers(); fetchMembers(); }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-amber-500/40"
                  title="Refresh team directory"
                >
                  <RefreshCw size={12} className={loadingUniversal || loadingMembers ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
            </div>

            {/* Sync Status Banner */}
            {syncStatusMsg && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 text-xs animate-in fade-in">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{syncStatusMsg}</span>
              </div>
            )}

            {/* Leader Sub-Tabs: Universal Team Members vs Central Clients Directory */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <button
                type="button"
                onClick={() => setActiveLeaderSubTab('members')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeLeaderSubTab === 'members'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/40'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <Users size={15} />
                <span>Universal Team Members</span>
                <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-semibold">
                  {universalUsers.length || members.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLeaderSubTab('clients')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeLeaderSubTab === 'clients'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/40'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <Building2 size={15} />
                <span>Clients Directory &amp; Portal Access</span>
                <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-semibold">
                  {clients.length || 203}
                </span>
              </button>
            </div>

            {activeLeaderSubTab === 'members' && (
              <>
                {/* Ecosystem Stats Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className={`p-3.5 rounded-xl border ${cardBgClass} text-center`}>
                <div className="text-[10px] font-semibold uppercase text-slate-400">Universal Accounts</div>
                <div className="text-lg font-bold text-white mt-1">{universalUsers.length || members.length}</div>
              </div>
              <div className={`p-3.5 rounded-xl border ${cardBgClass} text-center`}>
                <div className="text-[10px] font-semibold uppercase text-blue-400">Task Manager</div>
                <div className="text-lg font-bold text-blue-300 mt-1">
                  {universalUsers.filter(u => u.dashboardAccess?.task_manager?.enabled !== false).length || members.length}
                </div>
              </div>
              <div className={`p-3.5 rounded-xl border ${cardBgClass} text-center`}>
                <div className="text-[10px] font-semibold uppercase text-purple-400">Litigator</div>
                <div className="text-lg font-bold text-purple-300 mt-1">
                  {universalUsers.filter(u => u.dashboardAccess?.litigator?.enabled).length}
                </div>
              </div>
              <div className={`p-3.5 rounded-xl border ${cardBgClass} text-center`}>
                <div className="text-[10px] font-semibold uppercase text-emerald-400">Patent Hub</div>
                <div className="text-lg font-bold text-emerald-300 mt-1">
                  {universalUsers.filter(u => u.dashboardAccess?.patent?.enabled).length}
                </div>
              </div>
              <div className={`p-3.5 rounded-xl border ${cardBgClass} text-center`}>
                <div className="text-[10px] font-semibold uppercase text-amber-400">Finance &amp; Exec</div>
                <div className="text-lg font-bold text-amber-300 mt-1">
                  {universalUsers.filter(u => u.dashboardAccess?.finance?.enabled).length}
                </div>
              </div>
            </div>

            {/* Add New Universal Member Card */}
            <div className={`rounded-2xl border p-6 transition-all ${cardBgClass}`}>
              <h2 className="text-base font-bold mb-4 flex items-center gap-2">
                <UserPlus size={18} className="text-blue-400" />
                <span>Provision Universal Team Member</span>
              </h2>

              <form onSubmit={handleAddMember}>
                {/* Basic Info Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Akshay Sharma"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        if (!newEmail && e.target.value) {
                          setNewEmail(`${e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')}@lextria.in`);
                        }
                      }}
                      required
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Universal Login Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. akshay@lextria.in"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                        Password <span className="text-red-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewPassword(generateRandomPassword())}
                        className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer font-medium"
                      >
                        Auto-Gen
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Lx!9aB7#kQ"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono ${inputBgClass}`}
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
                      <option value="Finance">Finance</option>
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
                      placeholder="e.g. Senior Associate"
                      value={newDesignation}
                      onChange={(e) => setNewDesignation(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputBgClass}`}
                    />
                  </div>
                </div>

                {/* Dashboard Access Control Matrix */}
                <div className="mb-5 p-4 rounded-xl bg-black/25 border border-white/10">
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Layers size={14} className="text-blue-400" />
                    <span>Cross-Dashboard Access &amp; Permissions</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* 1. Task Manager */}
                    <div className="p-3 rounded-lg border border-white/5 bg-white/5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                          <CheckSquare size={13} /> Task Manager
                        </span>
                        <input
                          type="checkbox"
                          checked={newDashAccess.task_manager?.enabled}
                          onChange={(e) => setNewDashAccess(prev => ({
                            ...prev,
                            task_manager: { ...prev.task_manager, enabled: e.target.checked }
                          }))}
                          className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                        />
                      </div>
                      <select
                        value={newDashAccess.task_manager?.role || 'member'}
                        disabled={!newDashAccess.task_manager?.enabled}
                        onChange={(e) => setNewDashAccess(prev => ({
                          ...prev,
                          task_manager: { ...prev.task_manager, role: e.target.value }
                        }))}
                        className={`w-full px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="member">Member</option>
                        <option value="leader">Leader</option>
                      </select>
                    </div>

                    {/* 2. Litigator */}
                    <div className="p-3 rounded-lg border border-white/5 bg-white/5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                          <Scale size={13} /> Litigator
                        </span>
                        <input
                          type="checkbox"
                          checked={newDashAccess.litigator?.enabled}
                          onChange={(e) => setNewDashAccess(prev => ({
                            ...prev,
                            litigator: { ...prev.litigator, enabled: e.target.checked }
                          }))}
                          className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer"
                        />
                      </div>
                      <select
                        value={newDashAccess.litigator?.role || 'ASSOCIATE'}
                        disabled={!newDashAccess.litigator?.enabled}
                        onChange={(e) => setNewDashAccess(prev => ({
                          ...prev,
                          litigator: { ...prev.litigator, role: e.target.value }
                        }))}
                        className={`w-full px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="ASSOCIATE">Associate</option>
                        <option value="LITIGATION_HEAD">Litigation Head</option>
                        <option value="INTERN">Intern</option>
                      </select>
                    </div>

                    {/* 3. Patent Dashboard */}
                    <div className="p-3 rounded-lg border border-white/5 bg-white/5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                          <FileText size={13} /> Patent Hub
                        </span>
                        <input
                          type="checkbox"
                          checked={newDashAccess.patent?.enabled}
                          onChange={(e) => setNewDashAccess(prev => ({
                            ...prev,
                            patent: { ...prev.patent, enabled: e.target.checked }
                          }))}
                          className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
                        />
                      </div>
                      <select
                        value={newDashAccess.patent?.role || 'DRAFTER'}
                        disabled={!newDashAccess.patent?.enabled}
                        onChange={(e) => setNewDashAccess(prev => ({
                          ...prev,
                          patent: { ...prev.patent, role: e.target.value }
                        }))}
                        className={`w-full px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="DRAFTER">Drafter</option>
                        <option value="FILER">Filer</option>
                        <option value="AUDITOR">Auditor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>

                    {/* 4. Finance & Office Exec */}
                    <div className="p-3 rounded-lg border border-white/5 bg-white/5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <DollarSign size={13} /> Finance
                        </span>
                        <input
                          type="checkbox"
                          checked={newDashAccess.finance?.enabled}
                          onChange={(e) => setNewDashAccess(prev => ({
                            ...prev,
                            finance: { ...prev.finance, enabled: e.target.checked }
                          }))}
                          className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                        />
                      </div>
                      <select
                        value={newDashAccess.finance?.mode || 'FULL'}
                        disabled={!newDashAccess.finance?.enabled}
                        onChange={(e) => setNewDashAccess(prev => ({
                          ...prev,
                          finance: { ...prev.finance, mode: e.target.value }
                        }))}
                        className={`w-full px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="FULL">Full Finance (Lead)</option>
                        <option value="EXECUTIVE">Exec (Post &amp; Petty Cash)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isAddingMember}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    {isAddingMember ? 'Creating Universal Account...' : 'Provision Universal Account'}
                  </button>
                </div>
              </form>
            </div>

            {/* Universal Team Members Directory Card */}
            <div className={`rounded-2xl border overflow-hidden transition-all ${cardBgClass}`}>
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <span>Universal Ecosystem Directory</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {universalUsers.length || members.length} Active Accounts
                    </span>
                  </h2>
                  <p className={`text-xs mt-0.5 ${subTextClass}`}>
                    Unified single login accounts functioning across all firm dashboards.
                  </p>
                </div>
              </div>

              {loadingUniversal ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-blue-400" /> Loading Universal Team Directory...
                </div>
              ) : (universalUsers.length === 0 && members.length === 0) ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No member records found. Click &quot;Sync 27 Legacy Members&quot; above to provision your team!
                </div>
              ) : (
                <div className="divide-y divide-white/5 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Member &amp; Login Email</th>
                        <th className="px-4 py-3">Department &amp; Title</th>
                        <th className="px-4 py-3">Universal Password</th>
                        <th className="px-4 py-3">Dashboard Permissions</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(universalUsers.length > 0 ? universalUsers : members.map(m => ({
                        id: m.id,
                        displayName: m.name,
                        email: `${(m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}@lextria.in`,
                        role: m.role === 'leader' ? 'SUPER_ADMIN' : 'STAFF',
                        department: 'Litigation',
                        cachedPassword: m.password,
                        dashboardAccess: {
                          task_manager: { enabled: true, role: m.role || 'member' },
                          litigator: { enabled: false, role: 'ASSOCIATE' },
                          patent: { enabled: false, role: 'DRAFTER' },
                          finance: { enabled: false, mode: 'NONE' },
                          client_portal: { enabled: false, clientId: '' }
                        }
                      }))).map((user) => {
                        const displayName = user.displayName || user.name || 'Member';
                        const email = user.email || `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '')}@lextria.in`;
                        const pass = user.cachedPassword || user.password || '';
                        const isPassRevealed = Boolean(revealedPasswords[user.id]);
                        const isYou = displayName.toLowerCase() === currentUserName.toLowerCase() || email.toLowerCase() === (currentUser?.email || '').toLowerCase();
                        const da = user.dashboardAccess || {};

                        return (
                          <tr key={user.id} className="hover:bg-white/5 transition-colors">
                            {/* Member info with avatar & email */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600/40 to-indigo-600/40 text-blue-300 font-bold flex items-center justify-center shrink-0 border border-white/10 text-xs">
                                  {displayName.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-white flex items-center gap-1.5">
                                    <span>{displayName}</span>
                                    {isYou && (
                                      <span className="text-[10px] text-blue-400 font-normal">(you)</span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                    <Mail size={11} className="text-slate-500" />
                                    <span>{email}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(email);
                                        alert('Email copied: ' + email);
                                      }}
                                      className="text-slate-500 hover:text-blue-400 transition"
                                      title="Copy Universal Login Email"
                                    >
                                      <Copy size={10} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Department & Designation */}
                            <td className="px-4 py-3.5 text-slate-300">
                              <div className="font-medium text-white">{user.department || 'General'}</div>
                              <div className="text-[11px] text-slate-400">{user.designation || 'Staff Member'}</div>
                            </td>

                            {/* Universal Password with copy & reveal */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 w-fit font-mono text-[11px]">
                                <Key size={12} className="text-amber-400 shrink-0" />
                                <span className="select-all">
                                  {isPassRevealed ? (pass || '••••••••') : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleRevealPassword(user.id)}
                                  className="text-slate-400 hover:text-white ml-1 transition cursor-pointer"
                                  title={isPassRevealed ? 'Hide Password' : 'Show Password'}
                                >
                                  {isPassRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                                {pass && (
                                  <button
                                    type="button"
                                    onClick={() => copyPasswordToClipboard(pass)}
                                    className="text-slate-400 hover:text-blue-400 ml-0.5 transition cursor-pointer"
                                    title="Copy Password"
                                  >
                                    <Copy size={12} />
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Dashboard Permissions Badges */}
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {da.task_manager?.enabled !== false && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                    Tasks: {da.task_manager?.role || (user.role === 'SUPER_ADMIN' ? 'Leader' : 'Member')}
                                  </span>
                                )}
                                {da.litigator?.enabled && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/25">
                                    Litigator: {da.litigator?.role || 'Assoc'}
                                  </span>
                                )}
                                {da.patent?.enabled && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                    Patent: {da.patent?.role || 'Drafter'}
                                  </span>
                                )}
                                {da.finance?.enabled && (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    da.finance?.mode === 'EXECUTIVE'
                                      ? 'bg-orange-500/15 text-orange-300 border-orange-500/25'
                                      : 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                                  }`}>
                                    {da.finance?.mode === 'EXECUTIVE' ? 'Finance: Exec Only' : 'Finance: Full'}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(user)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Edit Universal Permissions"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMember(user.id, displayName)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                                  title="Deactivate Universal Account"
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
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: CENTRAL CLIENTS DIRECTORY & CLIENT PORTAL ACCESS */}
      {/* ------------------------------------------------------------- */}
      {activeLeaderSubTab === 'clients' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Clients Directory Header & Action Bar */}
          <div className={`rounded-2xl border p-5 ${cardBgClass}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 size={18} className="text-blue-400" />
                  <span>Central Clients Directory &amp; Portal Access</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold border border-blue-500/30 font-mono">
                    core.clients
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage all firm clients, business entities, and their Client Portal credentials centrally.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={fetchClients}
                  disabled={loadingClients}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-white/10"
                  title="Reload clients from central Supabase"
                >
                  <RefreshCw size={13} className={loadingClients ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddClientModal(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-blue-500/25 active:scale-[0.99]"
                >
                  <Plus size={14} />
                  <span>Add New Client</span>
                </button>
              </div>
            </div>

            {/* Clients Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/5">
              <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                <div className="text-[10px] font-semibold uppercase text-slate-400">Total Registered</div>
                <div className="text-lg font-bold text-white mt-0.5">{clients.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                <div className="text-[10px] font-semibold uppercase text-emerald-400">Portal Active</div>
                <div className="text-lg font-bold text-emerald-300 mt-0.5">
                  {clients.filter(c => c.portalAccess).length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                <div className="text-[10px] font-semibold uppercase text-purple-400">Companies</div>
                <div className="text-lg font-bold text-purple-300 mt-0.5">
                  {clients.filter(c => (c.entity_type || '').toUpperCase() === 'COMPANY').length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
                <div className="text-[10px] font-semibold uppercase text-cyan-400">Individuals &amp; Other</div>
                <div className="text-lg font-bold text-cyan-300 mt-0.5">
                  {clients.filter(c => (c.entity_type || '').toUpperCase() !== 'COMPANY').length}
                </div>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={clientSearchQuery}
                  onChange={(e) => setClientSearchQuery(e.target.value)}
                  placeholder="Filter 203 clients by name, code (e.g. RMTPL), email, or phone..."
                  className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border outline-none text-white placeholder:text-slate-500 ${inputBgClass}`}
                />
              </div>

              {/* Entity Type Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['ALL', 'COMPANY', 'INDIVIDUAL', 'OTHER'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setClientTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                      clientTypeFilter === type
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {type === 'ALL' ? 'All Entities' : type.charAt(0) + type.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {clientsError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span>{clientsError}</span>
            </div>
          )}

          {/* Clients Table Card */}
          <div className={`rounded-2xl border overflow-hidden ${cardBgClass}`}>
            {loadingClients ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-400" />
                <span>Loading central clients directory...</span>
              </div>
            ) : clients.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <Building2 size={24} className="mx-auto mb-2 opacity-40 text-blue-400" />
                <span>No clients registered in central database yet.</span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-[#0d1226] border-b border-white/10 uppercase tracking-wider text-[10px] text-slate-400 font-bold z-10">
                    <tr>
                      <th className="px-4 py-3">Client Code</th>
                      <th className="px-4 py-3">Client Name &amp; Entity</th>
                      <th className="px-4 py-3">Contact Email &amp; Phone</th>
                      <th className="px-4 py-3">Tax Identifiers</th>
                      <th className="px-4 py-3">Client Portal</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {clients
                      .filter(c => {
                        if (clientTypeFilter !== 'ALL') {
                          if ((c.entity_type || 'OTHER').toUpperCase() !== clientTypeFilter) return false;
                        }
                        if (!clientSearchQuery.trim()) return true;
                        const q = clientSearchQuery.toLowerCase().trim();
                        return (
                          (c.client_code || '').toLowerCase().includes(q) ||
                          (c.client_name || '').toLowerCase().includes(q) ||
                          (c.email || '').toLowerCase().includes(q) ||
                          (c.phone || '').toLowerCase().includes(q) ||
                          (c.gstin || '').toLowerCase().includes(q)
                        );
                      })
                      .map((c) => (
                        <tr key={c.id} className="hover:bg-white/5 transition-colors">
                          {/* Client Code */}
                          <td className="px-4 py-3.5">
                            <span className="px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono font-bold text-xs inline-block">
                              {c.client_code || '—'}
                            </span>
                          </td>

                          {/* Client Name & Entity Type */}
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-white text-sm">
                              {c.client_name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-white/5 text-slate-400 border border-white/10">
                                {c.entity_type || 'COMPANY'}
                              </span>
                              {c.state_code && (
                                <span className="text-[10px] text-slate-500">
                                  State: {c.state_code}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Contact Email & Phone */}
                          <td className="px-4 py-3.5">
                            {c.email ? (
                              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                                <Mail size={11} className="text-slate-500 shrink-0" />
                                <span className="truncate max-w-[200px]">{c.email}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.email);
                                    alert('Copied email: ' + c.email);
                                  }}
                                  className="text-slate-500 hover:text-blue-400 transition"
                                  title="Copy Email"
                                >
                                  <Copy size={10} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-600 italic">No email set</span>
                            )}
                            {c.phone && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                                <Phone size={10} className="text-slate-500 shrink-0" />
                                <span>{c.phone}</span>
                              </div>
                            )}
                          </td>

                          {/* GSTIN & PAN */}
                          <td className="px-4 py-3.5 font-mono text-[11px]">
                            {c.gstin && (
                              <div className="text-slate-300">
                                <span className="text-slate-500 text-[10px]">GST: </span>
                                {c.gstin}
                              </div>
                            )}
                            {c.pan && (
                              <div className="text-slate-400 text-[10px]">
                                <span className="text-slate-500">PAN: </span>
                                {c.pan}
                              </div>
                            )}
                            {!c.gstin && !c.pan && (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          {/* Portal Status */}
                          <td className="px-4 py-3.5">
                            {c.portalAccess ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <ShieldCheck size={11} className="text-emerald-400" />
                                  <span>Portal Active</span>
                                </span>
                                <div className="text-[10px] text-slate-400 truncate max-w-[170px]" title={c.portalEmail}>
                                  {c.portalEmail}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/25">
                                <span>Not Provisioned</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditClient(c)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                title="Edit Client & Portal Access"
                              >
                                <Edit2 size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteClient(c)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                                title="Delete Client Entity"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )}

      </div>

      {/* ------------------------------------------------------------- */}
      {/* EDIT UNIVERSAL MEMBER MODAL (LEADER ONLY) */}
      {/* ------------------------------------------------------------- */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto ${cardBgClass}`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Edit2 size={16} className="text-blue-400" /> Edit Universal Account &amp; Dashboard Access
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase text-slate-300 mb-1">Universal Login Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase text-slate-300 mb-1">
                    Password (leave empty to keep current)
                  </label>
                  <input
                    type="text"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Enter new password to change"
                    className={`w-full px-3 py-2 rounded-xl border outline-none font-mono ${inputBgClass}`}
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
                    <option value="Finance">Finance</option>
                    <option value="Corporate">Corporate</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold uppercase text-slate-300 mb-1">Designation</label>
                  <input
                    type="text"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                    placeholder="e.g. Senior Associate"
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${inputBgClass}`}
                  />
                </div>
              </div>

              {/* Edit Dashboard Access Matrix */}
              <div className="p-3.5 rounded-xl bg-black/35 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={13} className="text-blue-400" />
                  <span>Dashboard Access Permissions</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Task Manager */}
                  <div className="p-2.5 rounded-lg border border-white/5 bg-white/5 flex items-center justify-between">
                    <span className="text-xs text-blue-300 font-semibold">Task Manager</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={editDashAccess.task_manager?.role || 'member'}
                        disabled={!editDashAccess.task_manager?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          task_manager: { ...prev.task_manager, role: e.target.value }
                        }))}
                        className={`px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="member">Member</option>
                        <option value="leader">Leader</option>
                      </select>
                      <input
                        type="checkbox"
                        checked={editDashAccess.task_manager?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          task_manager: { ...prev.task_manager, enabled: e.target.checked }
                        }))}
                        className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Litigator */}
                  <div className="p-2.5 rounded-lg border border-white/5 bg-white/5 flex items-center justify-between">
                    <span className="text-xs text-purple-300 font-semibold">Litigator</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={editDashAccess.litigator?.role || 'ASSOCIATE'}
                        disabled={!editDashAccess.litigator?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          litigator: { ...prev.litigator, role: e.target.value }
                        }))}
                        className={`px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="ASSOCIATE">Associate</option>
                        <option value="LITIGATION_HEAD">Head</option>
                        <option value="INTERN">Intern</option>
                      </select>
                      <input
                        type="checkbox"
                        checked={editDashAccess.litigator?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          litigator: { ...prev.litigator, enabled: e.target.checked }
                        }))}
                        className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Patent */}
                  <div className="p-2.5 rounded-lg border border-white/5 bg-white/5 flex items-center justify-between">
                    <span className="text-xs text-emerald-300 font-semibold">Patent Hub</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={editDashAccess.patent?.role || 'DRAFTER'}
                        disabled={!editDashAccess.patent?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          patent: { ...prev.patent, role: e.target.value }
                        }))}
                        className={`px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="DRAFTER">Drafter</option>
                        <option value="FILER">Filer</option>
                        <option value="AUDITOR">Auditor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <input
                        type="checkbox"
                        checked={editDashAccess.patent?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          patent: { ...prev.patent, enabled: e.target.checked }
                        }))}
                        className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Finance */}
                  <div className="p-2.5 rounded-lg border border-white/5 bg-white/5 flex items-center justify-between">
                    <span className="text-xs text-amber-300 font-semibold">Finance</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={editDashAccess.finance?.mode || 'FULL'}
                        disabled={!editDashAccess.finance?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          finance: { ...prev.finance, mode: e.target.value }
                        }))}
                        className={`px-2 py-1 text-[11px] rounded-lg border outline-none disabled:opacity-40 ${inputBgClass}`}
                      >
                        <option value="FULL">Full Finance</option>
                        <option value="EXECUTIVE">Exec Only</option>
                      </select>
                      <input
                        type="checkbox"
                        checked={editDashAccess.finance?.enabled}
                        onChange={(e) => setEditDashAccess(prev => ({
                          ...prev,
                          finance: { ...prev.finance, enabled: e.target.checked }
                        }))}
                        className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
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
                  {isUpdatingMember ? 'Saving...' : 'Update Universal Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
