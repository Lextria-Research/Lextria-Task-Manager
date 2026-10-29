// src/PatentFiling/patentNotifications.js
// Complete Notification & Sound System for Patent Filing Workflow
// Handles database persistence, sound coordination across tabs, audio autoplay unlock,
// desktop notifications (when backgrounded), offline catchup, and alerts list.

import { supabase } from '../supabaseClient.js';
import { isMemberMatch } from '../patent/patentRoles.js';

export const LOCAL_NOTIFICATIONS_KEY = 'lextria_patent_notifications_cache';
export const DISPLAYED_TOASTS_KEY = 'lextria_displayed_toast_ids';
export const SOUND_COORDINATION_CHANNEL = 'lextria_sound_coordination';

/**
 * Format estimated minutes to human-readable 'Xh Ym' string.
 * e.g., 150 -> '2h 30m', 60 -> '1h 0m', 45 -> '0h 45m'
 */
export function formatEstTime(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Generates notification message for the Assignee (Filer).
 */
export function buildAssigneeNotificationMessage(filing, creatorName = 'Mounisha') {
  const deadlineStr = filing.hard_deadline ? filing.hard_deadline : 'None';
  return `New filing assigned to you: ${filing.code} – ${filing.filing_type}. Est. filing time: ${formatEstTime(filing.est_filing_minutes)}. Deadline: ${deadlineStr}. Assigned by ${creatorName}.`;
}

/**
 * Generates notification message for the Auditor.
 */
export function buildAuditorNotificationMessage(filing) {
  return `You are the auditor for ${filing.code} – ${filing.filing_type}. Est. audit time: ${formatEstTime(filing.est_audit_minutes)}.`;
}

/**
 * Generates notification message for a removed member upon reassignment.
 */
export function buildReassignedNotificationMessage(filing) {
  return `${filing.code} has been reassigned.`;
}

/**
 * Generates confirmation toast message for Super Admin (Mounisha).
 */
export function buildSuperAdminConfirmationMessage(filing, assigneeName, auditorName) {
  return `${filing.code} assigned to ${assigneeName || 'Assignee'} (auditor: ${auditorName || 'Auditor'}).`;
}

/**
 * Builds server-decided notifications for a newly created filing.
 */
export function buildFilingCreationNotifications({
  filing,
  creatorName = 'Mounisha',
  assigneeUuid,
  auditorUuid
}) {
  const nowIso = new Date().toISOString();
  const notifId1 = `notif-${Date.now()}-assignee-${Math.random().toString(36).slice(2, 7)}`;
  const notifId2 = `notif-${Date.now()}-auditor-${Math.random().toString(36).slice(2, 7)}`;

  return [
    {
      id: notifId1,
      recipient_id: assigneeUuid || filing.assignee_id,
      filing_id: filing.id,
      code: filing.code,
      type: 'ASSIGNMENT_ASSIGNEE',
      role_type: 'filer',
      message: buildAssigneeNotificationMessage(filing, creatorName),
      read: false,
      created_at: nowIso
    },
    {
      id: notifId2,
      recipient_id: auditorUuid || filing.auditor_id,
      filing_id: filing.id,
      code: filing.code,
      type: 'ASSIGNMENT_AUDITOR',
      role_type: 'auditor',
      message: buildAuditorNotificationMessage(filing),
      read: false,
      created_at: nowIso
    }
  ];
}

/**
 * Builds server-decided notifications for reassignment.
 */
export function buildFilingReassignNotifications({
  filing,
  previousAssigneeId,
  previousAuditorId,
  newAssigneeId,
  newAuditorId,
  creatorName = 'Mounisha'
}) {
  const notifications = [];
  const nowIso = new Date().toISOString();

  // 1. Assignee changed
  if (newAssigneeId && String(newAssigneeId) !== String(previousAssigneeId)) {
    // New Assignee alert
    notifications.push({
      id: `notif-${Date.now()}-new-assignee-${Math.random().toString(36).slice(2, 7)}`,
      recipient_id: newAssigneeId,
      filing_id: filing.id,
      code: filing.code,
      type: 'ASSIGNMENT_ASSIGNEE',
      role_type: 'filer',
      message: buildAssigneeNotificationMessage(filing, creatorName),
      read: false,
      created_at: nowIso
    });

    // Removed Assignee alert
    if (previousAssigneeId) {
      notifications.push({
        id: `notif-${Date.now()}-prev-assignee-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: previousAssigneeId,
        filing_id: filing.id,
        code: filing.code,
        type: 'REASSIGNED',
        role_type: 'reassigned',
        message: buildReassignedNotificationMessage(filing),
        read: false,
        created_at: nowIso
      });
    }
  }

  // 2. Auditor changed
  if (newAuditorId && String(newAuditorId) !== String(previousAuditorId)) {
    // New Auditor alert
    notifications.push({
      id: `notif-${Date.now()}-new-auditor-${Math.random().toString(36).slice(2, 7)}`,
      recipient_id: newAuditorId,
      filing_id: filing.id,
      code: filing.code,
      type: 'ASSIGNMENT_AUDITOR',
      role_type: 'auditor',
      message: buildAuditorNotificationMessage(filing),
      read: false,
      created_at: nowIso
    });

    // Removed Auditor alert
    if (previousAuditorId) {
      notifications.push({
        id: `notif-${Date.now()}-prev-auditor-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: previousAuditorId,
        filing_id: filing.id,
        code: filing.code,
        type: 'REASSIGNED',
        role_type: 'reassigned',
        message: buildReassignedNotificationMessage(filing),
        read: false,
        created_at: nowIso
      });
    }
  }

  return notifications;
}

// ----------------------------------------------------
// DATABASE & STORAGE PERSISTENCE
// ----------------------------------------------------

export function getLocalNotificationsCache() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveLocalNotificationsCache(items) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(items));
  } catch (e) {}
}

/**
 * Persists notifications to Supabase table `patent_notifications` and local cache.
 */
export async function savePatentNotificationsToDb(notifications) {
  if (!notifications || notifications.length === 0) return;

  // 1. Update local cache immediately
  const existing = getLocalNotificationsCache();
  const merged = [...notifications, ...existing.filter(e => !notifications.some(n => n.id === e.id))];
  saveLocalNotificationsCache(merged);

  // 2. Insert into Supabase
  try {
    const recordsToInsert = notifications.map(n => ({
      recipient_id: n.recipient_id,
      filing_id: n.filing_id,
      code: n.code,
      type: n.type,
      role_type: n.role_type || 'filer',
      message: n.message,
      read: false,
      created_at: n.created_at || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('patent_notifications')
      .insert(recordsToInsert);

    if (error) {
      console.warn('Supabase notifications insert error:', error.message);
    }
  } catch (err) {
    console.warn('Supabase notifications insert exception:', err);
  }
}

/**
 * Fetches all notifications for a user from Supabase and local cache.
 */
export async function fetchUserPatentNotifications(userId) {
  if (!userId) return [];
  const cached = getLocalNotificationsCache().filter(n => isMemberMatch(userId, null, n.recipient_id));

  try {
    const { data, error } = await supabase
      .from('patent_notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // Merge unique
      const dbIds = new Set(data.map(d => d.id));
      const combined = [...data, ...cached.filter(c => !dbIds.has(c.id))];
      saveLocalNotificationsCache(combined);
      return combined;
    }
  } catch (e) {
    console.warn('fetchUserPatentNotifications error:', e);
  }

  return cached;
}

/**
 * Marks a notification as read.
 */
export async function markPatentNotificationAsRead(notificationId, userId) {
  const cached = getLocalNotificationsCache();
  const updated = cached.map(n => n.id === notificationId ? { ...n, read: true } : n);
  saveLocalNotificationsCache(updated);

  try {
    await supabase
      .from('patent_notifications')
      .update({ read: true })
      .eq('id', notificationId);
  } catch (e) {}
}

/**
 * Marks all notifications for a user as read.
 */
export async function markAllPatentNotificationsAsRead(userId) {
  const cached = getLocalNotificationsCache();
  const updated = cached.map(n => isMemberMatch(userId, null, n.recipient_id) ? { ...n, read: true } : n);
  saveLocalNotificationsCache(updated);

  try {
    await supabase
      .from('patent_notifications')
      .update({ read: true })
      .eq('recipient_id', userId);
  } catch (e) {}
}

// ----------------------------------------------------
// USER SOUND SETTINGS & AUTOPLAY UNLOCK
// ----------------------------------------------------

export function getPatentSoundEnabled(userId) {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(`lextria_patent_sound_${userId}`);
    return val !== 'false'; // default is true (On)
  } catch (e) {
    return true;
  }
}

export function setPatentSoundEnabled(userId, enabled) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`lextria_patent_sound_${userId}`, enabled ? 'true' : 'false');
  } catch (e) {}
}

export function isSoundUnlocked(userId) {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`lextria_sound_unlocked_${userId}`) === 'true';
  } catch (e) {
    return false;
  }
}

export function setSoundUnlocked(userId, unlocked = true) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`lextria_sound_unlocked_${userId}`, unlocked ? 'true' : 'false');
  } catch (e) {}
}

/**
 * Unlocks audio on user gesture by playing a brief silent tone.
 */
export function unlockAudioPlayback(userId) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // virtually silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    }
  } catch (e) {
    console.warn('AudioContext unlock failed:', e);
  }

  setSoundUnlocked(userId, true);
}

// ----------------------------------------------------
// MULTI-TAB SOUND & DESKTOP NOTIFICATION COORDINATION
// ----------------------------------------------------

let soundCoordinationChannel = null;

export function getSoundCoordinationChannel() {
  if (typeof window === 'undefined') return null;
  if (!soundCoordinationChannel && 'BroadcastChannel' in window) {
    try {
      soundCoordinationChannel = new BroadcastChannel(SOUND_COORDINATION_CHANNEL);
    } catch (e) {
      soundCoordinationChannel = null;
    }
  }
  return soundCoordinationChannel;
}

/**
 * Checks and claims a coordination lock so only ONE tab plays audio
 * and dispatches a native desktop notification for a given notification ID.
 * Returns true if this tab claimed the lock, false if another tab already did.
 */
export function tryAcquireSoundAndDesktopLock(notificationId) {
  if (typeof window === 'undefined' || !notificationId) return true;

  const lockKey = `lextria_sound_lock_${notificationId}`;
  const now = Date.now();
  const existing = localStorage.getItem(lockKey);

  if (existing) {
    const age = now - Number(existing);
    if (age < 5000) {
      // Another tab claimed this lock in the last 5 seconds
      return false;
    }
  }

  // Claim lock
  try {
    localStorage.setItem(lockKey, String(now));
  } catch (e) {}

  const channel = getSoundCoordinationChannel();
  if (channel) {
    try {
      channel.postMessage({ type: 'CLAIM_SOUND', notificationId, timestamp: now });
    } catch (e) {}
  }

  return true;
}

// ----------------------------------------------------
// SOUND PLAYBACK
// ----------------------------------------------------

/**
 * Plays the official notification sound at full volume.
 * Filer -> Air horn sound (/sounds/filer.mp3)
 * Auditor -> Door-bell Sound (/sounds/auditor.mp3)
 *
 * Catches any autoplay / browser errors without throwing.
 */
export function playPatentNotificationSound(roleType, userId) {
  if (typeof window === 'undefined') return false;

  // Check user setting
  if (!getPatentSoundEnabled(userId)) {
    return false;
  }

  try {
    const soundFile = roleType === 'auditor' ? '/sounds/auditor.mp3' : '/sounds/filer.mp3';
    const audio = new Audio(soundFile);
    audio.volume = 1.0; // Full volume as required

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Audio playback was blocked or failed:', err);
      });
    }
    return true;
  } catch (err) {
    console.warn('Audio playback error:', err);
    return false;
  }
}

// ----------------------------------------------------
// DESKTOP (OS) NOTIFICATIONS
// ----------------------------------------------------

/**
 * Dispatches a native desktop notification if tab is backgrounded / hidden.
 */
export function showPatentDesktopNotification({
  title,
  message,
  filingId,
  code,
  notificationId,
  onOpenFiling
}) {
  if (typeof window === 'undefined') return;
  const NotificationClass = window.Notification || (typeof Notification !== 'undefined' ? Notification : null);
  if (!NotificationClass || NotificationClass.permission !== 'granted') return;

  // Show desktop notification ONLY when tab is not visible or window not focused
  const isHiddenOrUnfocused = document.visibilityState === 'hidden' || (typeof document.hasFocus === 'function' && !document.hasFocus());
  if (!isHiddenOrUnfocused) {
    // In-app toast is enough when tab is visible
    return;
  }

  try {
    const notif = new NotificationClass(title || `Lextria Filing: ${code}`, {
      body: message,
      icon: '/favicon.svg',
      tag: notificationId // prevents OS duplicates
    });

    notif.onclick = () => {
      try {
        window.focus();
      } catch (e) {}
      if (onOpenFiling) {
        onOpenFiling(filingId, code);
      }
    };
  } catch (err) {
    console.warn('Desktop notification dispatch error:', err);
  }
}

// ----------------------------------------------------
// OFFLINE CATCH-UP DELIVERY (UP TO 24 HOURS)
// ----------------------------------------------------

export function getDisplayedToastIds() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DISPLAYED_TOASTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function recordDisplayedToastId(notificationId) {
  if (typeof window === 'undefined' || !notificationId) return;
  try {
    const existing = getDisplayedToastIds();
    if (!existing.includes(notificationId)) {
      existing.push(notificationId);
      localStorage.setItem(DISPLAYED_TOASTS_KEY, JSON.stringify(existing.slice(-200)));
    }
  } catch (e) {}
}

/**
 * Checks for offline notifications created within the last 24 hours.
 * Delivers in-app toast & sound on first login after being offline.
 */
export async function checkOfflinePatentNotifications({
  currentUser,
  onDeliverToast
}) {
  if (!currentUser || !currentUser.id) return;

  const notifications = await fetchUserPatentNotifications(currentUser.id);
  const unreadNotifs = notifications.filter(n => !n.read);
  const displayedIds = new Set(getDisplayedToastIds());
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  for (const notif of unreadNotifs) {
    if (displayedIds.has(notif.id)) {
      continue; // already toasted
    }

    const createdAt = notif.created_at ? new Date(notif.created_at).getTime() : now;
    const ageMs = now - createdAt;

    if (ageMs <= TWENTY_FOUR_HOURS) {
      // Within 24 hours: deliver toast + sound
      recordDisplayedToastId(notif.id);

      const hasLock = tryAcquireSoundAndDesktopLock(notif.id);
      if (hasLock) {
        playPatentNotificationSound(notif.role_type, currentUser.id);
      }

      if (onDeliverToast) {
        onDeliverToast(notif);
      }
    } else {
      // Over 24 hours: record as displayed for toast, remains in bell list only
      recordDisplayedToastId(notif.id);
    }
  }
}
