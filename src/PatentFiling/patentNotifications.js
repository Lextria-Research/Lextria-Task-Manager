// src/PatentFiling/patentNotifications.js
// Complete Notification & Sound System for Patent Filing Workflow
// Handles database persistence, sound coordination across tabs, audio autoplay unlock,
// desktop notifications (when backgrounded), offline catchup, and alerts list.

import { supabase } from '../supabaseClient.js';
import { isMemberMatch, getCanonicalMemberUuid, KNOWN_MEMBER_UUIDS } from '../patent/patentRoles.js';

export const LOCAL_NOTIFICATIONS_KEY = 'lextria_patent_notifications_cache';
export const DISPLAYED_TOASTS_KEY = 'lextria_displayed_toast_ids';
export const READ_NOTIFICATIONS_PREFIX = 'lextria_patent_read_notifs_';
export const SOUND_COORDINATION_CHANNEL = 'lextria_sound_coordination';

export function getReadNotificationIds(userId) {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = localStorage.getItem(`${READ_NOTIFICATIONS_PREFIX}${userId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

export function saveReadNotificationId(notificationId, userId) {
  if (typeof window === 'undefined' || !userId || !notificationId) return;
  try {
    const set = getReadNotificationIds(userId);
    set.add(notificationId);
    localStorage.setItem(`${READ_NOTIFICATIONS_PREFIX}${userId}`, JSON.stringify(Array.from(set).slice(-500)));
  } catch (e) {}
}

export function saveAllReadNotificationIds(notificationIds, userId) {
  if (typeof window === 'undefined' || !userId || !Array.isArray(notificationIds)) return;
  try {
    const set = getReadNotificationIds(userId);
    notificationIds.forEach(id => set.add(id));
    localStorage.setItem(`${READ_NOTIFICATIONS_PREFIX}${userId}`, JSON.stringify(Array.from(set).slice(-500)));
  } catch (e) {}
}

/**
 * Deduplicates a list of notifications so that each unique patent code / filing
 * keeps only its latest, most relevant notification per recipient.
 * Resolves user issue: "multiple notifications of the same patent codes."
 */
export function deduplicateNotificationsByLatest(notifications) {
  if (!Array.isArray(notifications) || notifications.length <= 1) {
    return notifications || [];
  }

  const latestMap = new Map();
  // Sort newest first
  const sorted = [...notifications].sort((a, b) => {
    const tA = new Date(a.created_at || a.timestamp || 0).getTime();
    const tB = new Date(b.created_at || b.timestamp || 0).getTime();
    return tB - tA;
  });

  for (const n of sorted) {
    if (!n) continue;
    // Generate clean group key per recipient and filing code / filing id
    const recipientKey = n.recipient_id ? String(n.recipient_id).toLowerCase().trim() : 'all';
    const codeKey = (n.code || n.filing_id || n.id || '').trim().toLowerCase();
    const key = `${recipientKey}_${codeKey}`;

    if (!latestMap.has(key)) {
      latestMap.set(key, n);
    }
  }

  return Array.from(latestMap.values());
}

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

/**
 * Builds server-decided notifications for filing stage transitions.
 * Plays respective sound (filer.mp3 / auditor.mp3) for respective personnel at every stage:
 * - ASSIGNED -> FILING: Auditor notified that filing is accepted & active (auditor.mp3)
 * - -> AUDIT (from FILING or CORRECTION): Auditor notified of submitted filing (auditor.mp3)
 * - AUDIT -> CORRECTION: Assignee notified of requested corrections with reason (filer.mp3)
 * - AUDIT -> PAYMENT: Assignee notified that audit passed and moved to payment (filer.mp3)
 * - PAYMENT -> ACK: Ack Checker (Prashanth) & Assignee notified of payment confirmation (auditor.mp3 / filer.mp3)
 * - ACK -> CLOSED: Assignee and Auditor notified of completion and official close (filer.mp3 / auditor.mp3)
 * - Force Move (Super Admin): Respective assignee / auditor / ack checker notified
 */
export function buildFilingTransitionNotifications({
  filing,
  fromStatus,
  toStatus,
  actor,
  payload = {},
  allMembers = []
}) {
  if (!filing || !toStatus) return [];

  const notifications = [];
  const nowIso = new Date().toISOString();
  const actorName = actor?.name || 'Team Member';
  const actorId = actor?.id;

  const isActorAssignee = isMemberMatch(actorId, actorName, filing.assignee_id, filing.assignee_name);
  const isActorAuditor = isMemberMatch(actorId, actorName, filing.auditor_id, filing.auditor_name);

  // 1. ASSIGNED -> FILING
  if (toStatus === 'FILING') {
    if (filing.auditor_id && !isActorAuditor) {
      notifications.push({
        id: `notif-${Date.now()}-filing-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: filing.auditor_id,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_FILING',
        role_type: 'auditor', // Doorbell sound
        message: `${filing.code} accepted by Assignee (${filing.assignee_name || 'Assignee'}) and is now in filing.`,
        read: false,
        created_at: nowIso
      });
    }
  }

  // 2. -> AUDIT (submitted by Assignee from FILING or CORRECTION)
  else if (toStatus === 'AUDIT') {
    if (filing.auditor_id && !isActorAuditor) {
      const isReaudit = fromStatus === 'CORRECTION';
      const tempVal = filing.temp_code || payload?.temp_code;
      const tempPart = tempVal ? ` [Temp: ${tempVal}]` : '';
      notifications.push({
        id: `notif-${Date.now()}-audit-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: filing.auditor_id,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_AUDIT',
        role_type: 'auditor', // Doorbell sound
        message: isReaudit
          ? `${filing.code}${tempPart} corrections submitted for re-audit by ${filing.assignee_name || 'Assignee'}. Est. audit time: ${formatEstTime(filing.est_audit_minutes)}.`
          : `${filing.code}${tempPart} has been submitted for your audit by ${filing.assignee_name || 'Assignee'}. Est. audit time: ${formatEstTime(filing.est_audit_minutes)}.`,
        read: false,
        created_at: nowIso
      });
    }
  }

  // 3. AUDIT -> CORRECTION (sent by Auditor)
  else if (toStatus === 'CORRECTION') {
    if (filing.assignee_id && !isActorAssignee) {
      const desc = payload?.description ? ` Reason: ${payload.description}` : '';
      notifications.push({
        id: `notif-${Date.now()}-correction-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: filing.assignee_id,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_CORRECTION',
        role_type: 'filer', // Air horn sound
        message: `${filing.code} sent for correction by Auditor (${filing.auditor_name || 'Auditor'}).${desc}`,
        read: false,
        created_at: nowIso
      });
    }
  }

  // 4. -> PAYMENT (Auditor and Assignee both get notification chime sound)
  else if (toStatus === 'PAYMENT') {
    if (filing.assignee_id) {
      notifications.push({
        id: `notif-${Date.now()}-payment-assignee-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: filing.assignee_id,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_PAYMENT',
        role_type: 'filer', // Notification chime for Assignee
        message: `${filing.code} moved to Payment stage.`,
        read: false,
        created_at: nowIso
      });
    }
    if (filing.auditor_id) {
      notifications.push({
        id: `notif-${Date.now()}-payment-auditor-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: filing.auditor_id,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_PAYMENT_AUDITOR',
        role_type: 'auditor', // Notification chime for Auditor
        message: `${filing.code} moved to Payment stage.`,
        read: false,
        created_at: nowIso
      });
    }
  }

  // 5. PAYMENT -> ACK (payment confirmed)
  else if (toStatus === 'ACK') {
    // Ack Checker: Prashanth (f7fe55e4-7c00-4030-86ed-0ccf39737074)
    const ackCheckerId = 'f7fe55e4-7c00-4030-86ed-0ccf39737074';
    const ref = payload?.payment_reference ? ` (Ref: ${payload.payment_reference})` : '';

    if (!isMemberMatch(actorId, actorName, ackCheckerId)) {
      notifications.push({
        id: `notif-${Date.now()}-ack-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: ackCheckerId,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_ACK_PENDING',
        role_type: 'auditor', // Doorbell sound
        message: `${filing.code} payment confirmed${ref}. Acknowledgment receipt pending.`,
        read: false,
        created_at: nowIso
      });
    }

    if (filing.assignee_id && !isActorAssignee && String(filing.assignee_id) !== String(ackCheckerId)) {
      notifications.push({
        id: `notif-${Date.now()}-ack-assignee-${Math.random().toString(36).slice(2, 7)}`,
        recipient_id: filing.assignee_id,
        filing_id: filing.id,
        code: filing.code,
        type: 'STAGE_ACK_CONFIRMED',
        role_type: 'filer', // Air horn sound
        message: `${filing.code} payment confirmed${ref}. Moved to Acknowledgment.`,
        read: false,
        created_at: nowIso
      });
    }
  }

  // 6. ACK -> CLOSED or MISC -> CLOSED
  else if (toStatus === 'CLOSED') {
    if (fromStatus === 'MISC') {
      // MISC task completed by assignee: notify Super Admin Mounisha
      const mounishaUuid = '42a71f9a-7119-457c-8092-0d5b75ce3060';
      if (!isMemberMatch(actorId, actorName, mounishaUuid, 'Mounisha')) {
        notifications.push({
          id: `notif-${Date.now()}-closed-misc-${Math.random().toString(36).slice(2, 7)}`,
          recipient_id: mounishaUuid,
          filing_id: filing.id,
          code: filing.code,
          type: 'STAGE_CLOSED',
          role_type: 'auditor', // Doorbell sound
          message: `${filing.code} – "${filing.task_title || filing.title || 'Task'}" has been marked Completed by ${actorName || 'Assignee'}!`,
          read: false,
          created_at: nowIso
        });
      }
    } else {
      if (filing.assignee_id && !isActorAssignee) {
        notifications.push({
          id: `notif-${Date.now()}-closed-assignee-${Math.random().toString(36).slice(2, 7)}`,
          recipient_id: filing.assignee_id,
          filing_id: filing.id,
          code: filing.code,
          type: 'STAGE_CLOSED',
          role_type: 'filer', // Air horn sound
          message: `${filing.code} – ${filing.filing_type} has been officially closed and completed!`,
          read: false,
          created_at: nowIso
        });
      }
      if (filing.auditor_id && !isActorAuditor) {
        notifications.push({
          id: `notif-${Date.now()}-closed-auditor-${Math.random().toString(36).slice(2, 7)}`,
          recipient_id: filing.auditor_id,
          filing_id: filing.id,
          code: filing.code,
          type: 'STAGE_CLOSED',
          role_type: 'auditor', // Doorbell sound
          message: `${filing.code} – ${filing.filing_type} has been officially closed and completed!`,
          read: false,
          created_at: nowIso
        });
      }
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
  if (!notifications || notifications.length === 0) return [];

  // 1. Update local cache immediately with deduplication
  const existing = getLocalNotificationsCache();
  const merged = deduplicateNotificationsByLatest([
    ...notifications,
    ...existing.filter(e => !notifications.some(n => n.id === e.id))
  ]);
  saveLocalNotificationsCache(merged);

  // 2. Insert into Supabase and retrieve persisted records with database UUIDs
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

    const { data, error } = await supabase
      .from('patent_notifications')
      .insert(recordsToInsert)
      .select();

    if (error) {
      console.warn('Supabase notifications insert error:', error.message);
      return notifications;
    }

    if (Array.isArray(data) && data.length > 0) {
      // Sync local cache: match by ID OR by (recipient_id + filing_id/code + type)
      // to ensure temporary client IDs are cleanly replaced by DB UUIDs
      const isMatch = (dbItem, localItem) =>
        dbItem.id === localItem.id ||
        (dbItem.recipient_id === localItem.recipient_id &&
         (dbItem.filing_id === localItem.filing_id || dbItem.code === localItem.code) &&
         dbItem.type === localItem.type);

      const existingCache = getLocalNotificationsCache();
      const updatedLocal = deduplicateNotificationsByLatest([
        ...data,
        ...existingCache.filter(e => !data.some(d => isMatch(d, e)))
      ]);
      saveLocalNotificationsCache(updatedLocal);
      return data;
    }
  } catch (err) {
    console.warn('Supabase notifications insert exception:', err);
  }

  return notifications;
}

/**
 * Fetches all notifications for a user from Supabase and local cache.
 * If the patent_notifications table does not exist or has no records,
 * dynamically synthesizes notifications from patent_filings and patent_filing_events.
 */
export async function fetchUserPatentNotifications(userId, currentUser = null) {
  if (!userId) return [];
  const uName = currentUser?.name || (typeof userId === 'string' && !userId.includes('-') ? userId : null);
  const readIds = getReadNotificationIds(userId);
  const cached = getLocalNotificationsCache().filter(n => isMemberMatch(userId, uName, n.recipient_id));

  let dbNotifs = [];

  // 1. Resolve canonical user IDs (member UUID, agent ID, alias) to reliably match remote DB rows
  const canonicalUuid = getCanonicalMemberUuid(currentUser || { id: userId, name: uName });
  const rawId = String(userId).toLowerCase().trim();
  const targetIds = Array.from(new Set([
    rawId,
    canonicalUuid ? canonicalUuid.toLowerCase().trim() : null,
    uName && KNOWN_MEMBER_UUIDS[uName.toLowerCase()] ? KNOWN_MEMBER_UUIDS[uName.toLowerCase()].toLowerCase() : null
  ].filter(Boolean)));

  // Try querying remote patent_notifications table with all matched target IDs
  try {
    let query = supabase.from('patent_notifications').select('*');
    if (targetIds.length === 1) {
      query = query.eq('recipient_id', targetIds[0]);
    } else {
      query = query.in('recipient_id', targetIds);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      // Further filter with isMemberMatch for security and privacy
      dbNotifs = data.filter(n => isMemberMatch(userId, uName, n.recipient_id));
    }
  } catch (e) {
    // Expected when patent_notifications table is not yet migrated in Supabase
  }

  // 2. Synthesize notifications from live patent_filings and patent_filing_events
  if (dbNotifs.length === 0) {
    try {
      const { data: filings } = await supabase.from('patent_filings').select('*');
      if (Array.isArray(filings) && filings.length > 0) {
        const myFilings = filings.filter(f =>
          isMemberMatch(userId, uName, f.assignee_id, f.assignee_name) ||
          (!f.is_misc && f.status !== 'MISC' && f.filing_type !== 'MISC' && isMemberMatch(userId, uName, f.auditor_id, f.auditor_name))
        );

        if (myFilings.length > 0) {
          const filingIds = myFilings.map(f => f.id);
          const { data: events } = await supabase
            .from('patent_filing_events')
            .select('*')
            .in('filing_id', filingIds)
            .order('timestamp', { ascending: false });

          const derived = [];
          myFilings.forEach(filing => {
            const isAssignee = isMemberMatch(userId, uName, filing.assignee_id, filing.assignee_name);
            const isAuditor = !filing.is_misc && filing.status !== 'MISC' && filing.filing_type !== 'MISC' && isMemberMatch(userId, uName, filing.auditor_id, filing.auditor_name);
            const filingEvents = (events || []).filter(e => e.filing_id === filing.id);

            // Handle MISC tasks: ONLY assignee gets a notification; NO auditor notification EVER!
            if (filing.status === 'MISC' || filing.filing_type === 'MISC' || filing.is_misc) {
              if (isAssignee && !isMemberMatch(userId, uName, filing.created_by, filing.created_by_name)) {
                const notifId = `notif-misc-${filing.id}`;
                derived.push({
                  id: notifId,
                  recipient_id: filing.assignee_id,
                  filing_id: filing.id,
                  code: filing.code,
                  type: 'STAGE_MISC',
                  role_type: 'filer',
                  message: `${filing.created_by_name || 'Mounisha'} assigned you a new task: "${filing.task_title || filing.title || filing.code}"`,
                  read: readIds.has(notifId),
                  created_at: filing.created_at
                });
              }
              return; // Stop here for MISC tasks so no auditor notification is ever synthesized
            }

            // If the filing is officially CLOSED:
            // Only synthesize the closure notification, and auto-mark as read so it never fires offline toasts on login!
            if (filing.status === 'CLOSED') {
              const closeEvent = filingEvents.find(e => e.to_status === 'CLOSED') || {
                timestamp: filing.updated_at || filing.created_at
              };
              const notifId = `notif-closed-${filing.id}-${isAssignee ? 'assignee' : 'auditor'}`;
              derived.push({
                id: notifId,
                recipient_id: isAssignee ? filing.assignee_id : filing.auditor_id,
                filing_id: filing.id,
                code: filing.code,
                type: isAssignee ? 'STAGE_CLOSED' : 'STAGE_CLOSED_AUDITOR',
                role_type: isAssignee ? 'filer' : 'auditor',
                message: `${filing.code} – ${filing.filing_type || 'Patent Filing'} has been officially closed and completed!`,
                read: true, // Completed filings are archived/read so they never fire offline toasts on next-day login!
                created_at: closeEvent.timestamp || filing.created_at
              });
              return; // Do NOT synthesize older intermediate stage alerts for closed filings!
            }

            // Normal filing assignment notification
            const createEvent = filingEvents.find(e => e.to_status === 'ASSIGNED' && !e.from_status) || {
              timestamp: filing.created_at
            };

            if (isAssignee) {
              const notifId = `notif-assignee-${filing.id}`;
              derived.push({
                id: notifId,
                recipient_id: filing.assignee_id,
                filing_id: filing.id,
                code: filing.code,
                type: 'ASSIGNMENT_ASSIGNEE',
                role_type: 'filer',
                message: buildAssigneeNotificationMessage(filing, filing.created_by_name || 'Mounisha'),
                read: readIds.has(notifId),
                created_at: createEvent.timestamp || filing.created_at
              });
            }

            if (isAuditor) {
              const notifId = `notif-auditor-${filing.id}`;
              derived.push({
                id: notifId,
                recipient_id: filing.auditor_id,
                filing_id: filing.id,
                code: filing.code,
                type: 'ASSIGNMENT_AUDITOR',
                role_type: 'auditor',
                message: buildAuditorNotificationMessage(filing),
                read: readIds.has(notifId),
                created_at: createEvent.timestamp || filing.created_at
              });
            }

            // Events transitions
            filingEvents.forEach(e => {
              if (e.to_status === 'AUDIT' && isAuditor) {
                const nId = `notif-event-${e.id}-auditor`;
                derived.push({
                  id: nId,
                  recipient_id: filing.auditor_id,
                  filing_id: filing.id,
                  code: filing.code,
                  type: 'STAGE_AUDIT',
                  role_type: 'auditor',
                  message: `${filing.code} submitted for Audit review.`,
                  read: readIds.has(nId),
                  created_at: e.timestamp
                });
              } else if (e.to_status === 'CORRECTION' && isAssignee) {
                const nId = `notif-event-${e.id}-correction`;
                derived.push({
                  id: nId,
                  recipient_id: filing.assignee_id,
                  filing_id: filing.id,
                  code: filing.code,
                  type: 'STAGE_CORRECTION',
                  role_type: 'filer',
                  message: `${filing.code} returned with corrections needed by Auditor.`,
                  read: readIds.has(nId),
                  created_at: e.timestamp
                });
              } else if (e.to_status === 'PAYMENT') {
                if (isAssignee) {
                  const nId = `notif-event-${e.id}-pay-assignee`;
                  derived.push({
                    id: nId,
                    recipient_id: filing.assignee_id,
                    filing_id: filing.id,
                    code: filing.code,
                    type: 'STAGE_PAYMENT',
                    role_type: 'filer',
                    message: `${filing.code} moved to Payment stage.`,
                    read: readIds.has(nId),
                    created_at: e.timestamp
                  });
                }
                if (isAuditor) {
                  const nId = `notif-event-${e.id}-pay-auditor`;
                  derived.push({
                    id: nId,
                    recipient_id: filing.auditor_id,
                    filing_id: filing.id,
                    code: filing.code,
                    type: 'STAGE_PAYMENT_AUDITOR',
                    role_type: 'auditor',
                    message: `${filing.code} moved to Payment stage.`,
                    read: readIds.has(nId),
                    created_at: e.timestamp
                  });
                }
              } else if (e.to_status === 'CLOSED') {
                if (isAssignee) {
                  const nId = `notif-event-${e.id}-closed-assignee`;
                  derived.push({
                    id: nId,
                    recipient_id: filing.assignee_id,
                    filing_id: filing.id,
                    code: filing.code,
                    type: 'STAGE_CLOSED',
                    role_type: 'filer',
                    message: `${filing.code} officially closed and completed.`,
                    read: readIds.has(nId),
                    created_at: e.timestamp
                  });
                }
                if (isAuditor) {
                  const nId = `notif-event-${e.id}-closed-auditor`;
                  derived.push({
                    id: nId,
                    recipient_id: filing.auditor_id,
                    filing_id: filing.id,
                    code: filing.code,
                    type: 'STAGE_CLOSED_AUDITOR',
                    role_type: 'auditor',
                    message: `${filing.code} officially closed and completed.`,
                    read: readIds.has(nId),
                    created_at: e.timestamp
                  });
                }
              }
            });
          });

          dbNotifs = derived;
        }
      }
    } catch (err) {
      console.warn('Derive notifications fallback exception:', err);
    }
  }

  // 3. Merge unique with local cached notifications
  const dbIds = new Set(dbNotifs.map(d => d.id));
  const combined = [...dbNotifs, ...cached.filter(c => !dbIds.has(c.id))];

  // Apply read state
  const withReadState = combined.map(n => readIds.has(n.id) ? { ...n, read: true } : n);
  
  // Deduplicate by latest per recipient and code so each patent code has only its latest notification
  const deduped = deduplicateNotificationsByLatest(withReadState);
  deduped.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  saveLocalNotificationsCache(deduped);
  return deduped;
}

/**
 * Marks a notification as read.
 */
export async function markPatentNotificationAsRead(notificationId, userId) {
  saveReadNotificationId(notificationId, userId);

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
  const idsToMark = cached
    .filter(n => isMemberMatch(userId, null, n.recipient_id))
    .map(n => n.id);
  saveAllReadNotificationIds(idsToMark, userId);

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

// ----------------------------------------------------
// WEB AUDIO ENGINE & BUFFER CACHE
// ----------------------------------------------------

let sharedAudioContext = null;
const audioBufferCache = new Map();

/**
 * Returns a shared Web Audio context that is resumed on user gesture.
 */
export function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new AudioCtx();
    } catch (e) {
      console.warn('Could not initialize AudioContext:', e);
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Loads and decodes an audio file into memory for instant, reliable playback.
 */
async function loadAudioBuffer(url, ctx) {
  if (!ctx) return null;
  if (audioBufferCache.has(url)) return audioBufferCache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache.set(url, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.warn(`Audio buffer load failed for ${url}:`, err);
    return null;
  }
}

/**
 * Synthesizes an audible notification chime using Web Audio oscillators.
 * Guaranteed to play even if audio files are blocked or network is unavailable.
 */
function playSynthesizedChime(roleType, ctx) {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.05);

    if (roleType === 'auditor') {
      // Doorbell chime: 659.25Hz (E5) -> 523.25Hz (C5)
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      osc1.frequency.setValueAtTime(523.25, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      osc1.connect(gain);
      osc1.start(now);
      osc1.stop(now + 0.85);
    } else {
      // Filer / Task chime: Upbeat rising dual-tone 587.33Hz (D5) -> 880Hz (A5)
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.setValueAtTime(880.0, now + 0.15);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(293.66, now);
      osc2.frequency.setValueAtTime(440.0, now + 0.15);

      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc1.connect(gain);
      osc2.connect(gain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.75);
      osc2.stop(now + 0.75);
    }
  } catch (e) {
    console.warn('Synthesized chime error:', e);
  }
}

/**
 * Unlocks audio on user gesture by resuming the shared AudioContext.
 */
export function unlockAudioPlayback(userId) {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
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
export function tryAcquireSoundAndDesktopLock(notificationId, userId = null) {
  if (typeof window === 'undefined' || !notificationId) return true;

  const userPrefix = userId ? `${String(userId).toLowerCase()}_` : '';
  const lockKey = `lextria_sound_lock_${userPrefix}${notificationId}`;
  const now = Date.now();
  const existing = localStorage.getItem(lockKey);

  if (existing) {
    const age = now - Number(existing);
    if (age < 5000) {
      // Another tab for this same user claimed this lock in the last 5 seconds
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
      channel.postMessage({ type: 'CLAIM_SOUND', notificationId, userId, timestamp: now });
    } catch (e) {}
  }

  return true;
}

// ----------------------------------------------------
// SOUND PLAYBACK
// ----------------------------------------------------

/**
 * Plays the official notification sound at full volume.
 * Filer / Task -> Air horn sound (/sounds/filer.mp3) or rising chime
 * Auditor -> Door-bell Sound (/sounds/auditor.mp3) or doorbell chime
 *
 * Uses both Web Audio API buffer and HTML5 Audio with fallback to
 * synthesized oscillators so sound is guaranteed to play even if
 * autoplay policy blocks standard media elements.
 */
export function playPatentNotificationSound(roleType, userId) {
  if (typeof window === 'undefined') return false;

  // Check user setting
  if (!getPatentSoundEnabled(userId)) {
    return false;
  }

  const soundFile = roleType === 'auditor' ? '/sounds/auditor.mp3' : '/sounds/filer.mp3';
  const ctx = getSharedAudioContext();

  // 1. First attempt: Web Audio API with pre-loaded buffer or on-the-fly fetch
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    loadAudioBuffer(soundFile, ctx).then(buffer => {
      if (buffer) {
        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = 1.0;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start(0);
          return;
        } catch (e) {}
      }
      playSynthesizedChime(roleType, ctx);
    }).catch(() => {
      playSynthesizedChime(roleType, ctx);
    });
  }

  // 2. Parallel attempt: Standard HTML5 Audio element
  try {
    const audio = new Audio(soundFile);
    audio.volume = 1.0; // Full volume as required
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        // Autoplay policy or media restriction caught; Web Audio handled or will handle
        if (ctx) {
          playSynthesizedChime(roleType, ctx);
        }
      });
    }
    return true;
  } catch (err) {
    if (ctx) {
      playSynthesizedChime(roleType, ctx);
    }
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

export function getDisplayedToastIds(userId = null) {
  if (typeof window === 'undefined') return [];
  try {
    const key = userId ? `${DISPLAYED_TOASTS_KEY}_${String(userId).toLowerCase()}` : DISPLAYED_TOASTS_KEY;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function recordDisplayedToastId(notificationId, userId = null) {
  if (typeof window === 'undefined' || !notificationId) return;
  try {
    const key = userId ? `${DISPLAYED_TOASTS_KEY}_${String(userId).toLowerCase()}` : DISPLAYED_TOASTS_KEY;
    const existing = getDisplayedToastIds(userId);
    if (!existing.includes(notificationId)) {
      existing.push(notificationId);
      localStorage.setItem(key, JSON.stringify(existing.slice(-200)));
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

  const notifications = await fetchUserPatentNotifications(currentUser.id, currentUser);
  const unreadNotifs = notifications.filter(n => !n.read);
  const displayedIds = new Set(getDisplayedToastIds(currentUser.id));
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Deduplicate unread notifications by code so only the latest notification per patent code is toasted
  const dedupedUnread = deduplicateNotificationsByLatest(unreadNotifs);

  let soundPlayed = false;
  let deliveredCount = 0;

  for (const notif of dedupedUnread) {
    // 1. Never synthesize or deliver an auditor assignment alert to the creator on MISC tasks
    if (notif.type === 'ASSIGNMENT_AUDITOR' && (notif.code?.startsWith('MISC') || notif.is_misc)) {
      continue;
    }

    // 2. NEVER deliver offline toasts/sounds for COMPLETED / CLOSED filings on login!
    // Resolves user issue: "receive old already completed notifications again alltogether whne logging on the next day."
    const isCompleted =
      notif.type === 'STAGE_CLOSED' ||
      notif.type === 'STAGE_CLOSED_AUDITOR' ||
      notif.status === 'CLOSED' ||
      notif.is_closed ||
      (notif.message && (
        notif.message.toLowerCase().includes('officially closed') ||
        notif.message.toLowerCase().includes('marked completed')
      ));

    if (isCompleted) {
      // Silently record as displayed so it doesn't disturb the user on next-day login
      recordDisplayedToastId(notif.id, currentUser.id);
      continue;
    }

    if (displayedIds.has(notif.id)) {
      continue; // already toasted for this user
    }

    const createdAt = notif.created_at ? new Date(notif.created_at).getTime() : now;
    const ageMs = now - createdAt;

    if (ageMs <= TWENTY_FOUR_HOURS) {
      recordDisplayedToastId(notif.id, currentUser.id);

      // Play sound at most ONCE during login catch-up (not in a repetitive loop)
      const hasLock = tryAcquireSoundAndDesktopLock(notif.id, currentUser.id);
      if (hasLock && !soundPlayed) {
        playPatentNotificationSound(notif.role_type || 'filer', currentUser.id);
        soundPlayed = true;
      }

      // Cap to at most 3 simultaneous toasts to prevent screen flooding on login
      if (onDeliverToast && deliveredCount < 3) {
        onDeliverToast(notif);
        deliveredCount++;
      }
    } else {
      // Over 24 hours: record as displayed for toast, remains in bell list only
      recordDisplayedToastId(notif.id, currentUser.id);
    }
  }
}
