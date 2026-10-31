// src/PatentFiling/patentStorage.js
// Client data service for Patent Filing Workflow with optimistic state updates,
// Supabase integration, serverless API dispatch, and robust fallback cache.

import { supabase } from '../supabaseClient.js';
import {
  executeTransition,
  executeReassign,
  PATENT_STATUSES,
  PATENT_ROLES,
  hasPatentRole
} from '../patent/patentStateMachine.js';
import { isLeaderOrSharan } from '../attachmentUtils.js';
import {
  KNOWN_MEMBER_UUIDS,
  KNOWN_AGENT_TO_MEMBER_UUIDS,
  getCanonicalMemberUuid,
  isSameMemberName
} from '../patent/patentRoles.js';
import { broadcastPatentChange } from './patentRealtime.js';
import {
  buildFilingCreationNotifications,
  buildFilingReassignNotifications,
  buildFilingTransitionNotifications,
  buildSuperAdminConfirmationMessage,
  savePatentNotificationsToDb
} from './patentNotifications.js';

export const LOCAL_STORAGE_KEY = 'lextria_patent_filings_cache';
export const LOCAL_EVENTS_KEY = 'lextria_patent_events_cache';
export const LOCAL_ROUNDS_KEY = 'lextria_patent_rounds_cache';

// Clean initial empty state - filings are stored and managed live in Supabase
const DEFAULT_DEMO_FILINGS = [];

export function getLocalCache(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return fallback;
}

export function saveLocalCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {}
}

export function getKnownMemberName(id, fallback = '') {
  if (!id) return fallback;
  const clean = String(id).toLowerCase();
  for (const [name, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
    if (clean === uuid || clean === `user_${name}`) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return fallback;
}

/**
 * Robust identity resolver that translates legacy string IDs (e.g. 'user_mounisha')
 * or member names to their canonical Postgres UUID in members(id).
 */
export function resolveMemberUuid(idOrName, fallbackUuid = '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers = []) {
  if (!idOrName) return fallbackUuid;
  const str = String(idOrName).trim().toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 1. Direct agent-to-member mapping
  if (KNOWN_AGENT_TO_MEMBER_UUIDS[str]) {
    return KNOWN_AGENT_TO_MEMBER_UUIDS[str];
  }

  // 2. Direct check against known member UUIDs or user aliases
  for (const [name, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
    if (str === uuid.toLowerCase() || str === `user_${name}` || isSameMemberName(str, name)) {
      return uuid;
    }
  }

  // 3. Check allMembers if provided
  if (Array.isArray(allMembers)) {
    const found = allMembers.find(m =>
      String(m.id).toLowerCase() === str ||
      (m.name && isSameMemberName(m.name, str))
    );
    if (found) {
      const canonical = getCanonicalMemberUuid(found);
      if (canonical && uuidRegex.test(canonical)) return canonical;
      if (uuidRegex.test(found.id)) return found.id;
    }
  }

  // 4. If it's already a valid UUID and no special mapping exists
  if (uuidRegex.test(str)) return str;

  return fallbackUuid;
}

/**
 * Loads all filings. First queries Supabase, falls back to local cache if offline.
 */
export async function loadFilingsFromStorage(allMembers = []) {
  try {
    const fetchSafe = async (fn) => {
      try {
        const res = await fn();
        return res?.data || [];
      } catch (e) {
        return [];
      }
    };

    const [filingsRes, roundsData, eventsData] = await Promise.all([
      supabase.from('patent_filings').select('*').order('created_at', { ascending: false }),
      fetchSafe(() => supabase.from('patent_correction_rounds').select('*').order('created_at', { ascending: false })),
      fetchSafe(() => supabase.from('patent_filing_events').select('*').order('timestamp', { ascending: false }))
    ]);

    if (Array.isArray(roundsData) && roundsData.length > 0) {
      saveLocalCache(LOCAL_ROUNDS_KEY, roundsData);
    }
    if (Array.isArray(eventsData) && eventsData.length > 0) {
      saveLocalCache(LOCAL_EVENTS_KEY, eventsData);
    }

    const { data, error } = filingsRes || {};

    if (!error && Array.isArray(data)) {
      const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
      const cachedMap = new Map(cached.map(c => [c.id, c]));

      const allRounds = Array.isArray(roundsData) && roundsData.length > 0 ? roundsData : getLocalCache(LOCAL_ROUNDS_KEY, []);
      const allEvents = Array.isArray(eventsData) && eventsData.length > 0 ? eventsData : getLocalCache(LOCAL_EVENTS_KEY, []);

      const roundsByFiling = new Map();
      allRounds.forEach(r => {
        if (!r.filing_id) return;
        const list = roundsByFiling.get(r.filing_id) || [];
        list.push(r);
        roundsByFiling.set(r.filing_id, list);
      });

      const eventsByFiling = new Map();
      allEvents.forEach(e => {
        if (!e.filing_id) return;
        const list = eventsByFiling.get(e.filing_id) || [];
        list.push(e);
        eventsByFiling.set(e.filing_id, list);
      });

      // Map names from allMembers or known UUIDs
      const enriched = data.map(f => {
        const a = allMembers.find(m => String(m.id) === String(f.assignee_id));
        const u = allMembers.find(m => String(m.id) === String(f.auditor_id));
        const c = cachedMap.get(f.id);
        return {
          ...f,
          temp_code: f.temp_code || c?.temp_code || null,
          assignee_name: a ? a.name : (f.assignee_name || getKnownMemberName(f.assignee_id, 'Assignee')),
          auditor_name: u ? u.name : (f.auditor_name || getKnownMemberName(f.auditor_id, 'Auditor')),
          correction_rounds: roundsByFiling.get(f.id) || c?.correction_rounds || [],
          events: eventsByFiling.get(f.id) || c?.events || []
        };
      });
      saveLocalCache(LOCAL_STORAGE_KEY, enriched);
      return enriched;
    }
    if (error) {
      console.warn('Supabase query error in loadFilingsFromStorage:', error.message);
    }
  } catch (err) {
    console.warn('Error loading filings from Supabase:', err);
  }

  // Fallback to local cache only if Supabase call failed
  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  if (Array.isArray(cached)) {
    return cached;
  }

  return [];
}

/**
 * Creates a new filing and persists it to Supabase and local cache.
 */
export async function saveNewFilingToStorage(filingData, actor, allMembers = []) {
  const cleanCode = (filingData.code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Filing code is required.' };
  }
  const cleanType = (filingData.filing_type || '').trim();
  if (!cleanType) {
    return { success: false, error: 'Filing type is required.' };
  }

  const creatorUuid = resolveMemberUuid(actor?.id || actor?.name, '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers);
  const assigneeUuid = resolveMemberUuid(filingData.assignee_id, null, allMembers);
  const auditorUuid = resolveMemberUuid(filingData.auditor_id, null, allMembers);

  if (!assigneeUuid || !auditorUuid) {
    return { success: false, error: 'Valid assignee and auditor are required.' };
  }
  if (assigneeUuid === auditorUuid) {
    return { success: false, error: 'Assignee and auditor must be different individuals.' };
  }

  const nowIso = new Date().toISOString();
  const assigneeMember = allMembers.find(m => String(m.id) === String(assigneeUuid));
  const auditorMember = allMembers.find(m => String(m.id) === String(auditorUuid));

  const newRecord = {
    id: `filing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: cleanCode,
    filing_type: cleanType,
    temp_code: filingData.temp_code || null,
    title: filingData.title || null,
    assignee_id: assigneeUuid,
    auditor_id: auditorUuid,
    assignee_name: assigneeMember ? assigneeMember.name : getKnownMemberName(assigneeUuid, 'Assignee'),
    auditor_name: auditorMember ? auditorMember.name : getKnownMemberName(auditorUuid, 'Auditor'),
    est_filing_minutes: Number(filingData.est_filing_minutes) || 0,
    est_audit_minutes: Number(filingData.est_audit_minutes) || 0,
    hard_deadline: filingData.hard_deadline || null,
    priority: filingData.priority || 'Medium',
    status: PATENT_STATUSES.ASSIGNED,
    version: 1,
    correction_count: 0,
    created_by: creatorUuid,
    created_at: nowIso,
    updated_at: nowIso
  };

  // 1. Insert into Supabase with guaranteed valid UUIDs
  try {
    const { data, error } = await supabase
      .from('patent_filings')
      .insert([{
        code: newRecord.code,
        filing_type: newRecord.filing_type,
        title: newRecord.title,
        assignee_id: assigneeUuid,
        auditor_id: auditorUuid,
        est_filing_minutes: newRecord.est_filing_minutes,
        est_audit_minutes: newRecord.est_audit_minutes,
        hard_deadline: newRecord.hard_deadline,
        priority: newRecord.priority,
        status: newRecord.status,
        version: 1,
        created_by: creatorUuid
      }])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error in saveNewFilingToStorage:', error);
      return { success: false, error: error.message };
    }

    if (data) {
      newRecord.id = data.id;
      newRecord.version = data.version;
      newRecord.created_at = data.created_at;
      newRecord.updated_at = data.updated_at;
    }
  } catch (e) {
    console.error('Supabase insert exception in saveNewFilingToStorage:', e);
    return { success: false, error: e.message || 'Database error creating filing.' };
  }

  // 2. Initial event
  const initialEvent = {
    filing_id: newRecord.id,
    from_status: null,
    to_status: PATENT_STATUSES.ASSIGNED,
    actor_id: creatorUuid,
    actor_name: actor?.name || 'Mounisha',
    timestamp: nowIso,
    note: 'Filing created and assigned by Super Admin'
  };

  try {
    await supabase.from('patent_filing_events').insert([{
      filing_id: newRecord.id,
      from_status: null,
      to_status: PATENT_STATUSES.ASSIGNED,
      actor_id: creatorUuid,
      timestamp: nowIso,
      note: initialEvent.note
    }]);
  } catch (e) {
    console.warn('Supabase event insert exception:', e);
  }

  // 3. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const updated = [newRecord, ...cached.filter(f => f.id !== newRecord.id && f.code !== newRecord.code)];
  saveLocalCache(LOCAL_STORAGE_KEY, updated);

  const events = getLocalCache(LOCAL_EVENTS_KEY, []);
  events.push(initialEvent);
  saveLocalCache(LOCAL_EVENTS_KEY, events);

  // 4. Generate & persist server-decided notifications for Assignee and Auditor
  const notifications = buildFilingCreationNotifications({
    filing: newRecord,
    creatorName: actor?.name || 'Mounisha',
    assigneeUuid,
    auditorUuid
  });
  await savePatentNotificationsToDb(notifications);

  // 5. Broadcast real-time change event across all connected clients
  broadcastPatentChange({
    action: 'CREATE',
    filing: newRecord,
    event: initialEvent,
    notifications,
    actorId: creatorUuid,
    actorName: actor?.name || 'Mounisha',
    version: newRecord.version
  });

  const confirmationToast = buildSuperAdminConfirmationMessage(newRecord, newRecord.assignee_name, newRecord.auditor_name);

  return { success: true, filing: newRecord, notifications, confirmationToast };
}

/**
 * Executes a state machine transition and synchronizes to Supabase.
 */
export async function executeTransitionInStorage({
  filing,
  toStatus,
  actor,
  actorRoles = [],
  note = '',
  payload = {},
  allMembers = []
}) {
  const fromStatus = filing?.status;
  const actorUuid = resolveMemberUuid(actor?.id || actor?.name, '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers);
  const result = await executeTransition({
    filing,
    expectedVersion: filing.version,
    toStatus,
    actorId: actor?.id,
    actorName: actor?.name,
    actor,
    actorRoles,
    note,
    payload
  });

  if (!result.success) {
    return result;
  }

  // 1. Update in Supabase if live
  try {
    const updatePayload = {
      status: result.filing.status,
      version: result.filing.version,
      correction_count: result.filing.correction_count,
      payment_reference: result.filing.payment_reference,
      updated_at: result.filing.updated_at
    };

    if (result.filing.temp_code !== undefined && result.filing.temp_code !== null) {
      updatePayload.temp_code = result.filing.temp_code;
    }

    if (result.filing.payment_confirmed_by) {
      updatePayload.payment_confirmed_by = resolveMemberUuid(result.filing.payment_confirmed_by, actorUuid, allMembers);
      updatePayload.payment_confirmed_at = result.filing.payment_confirmed_at;
    }
    if (result.filing.ack_confirmed_by) {
      updatePayload.ack_confirmed_by = resolveMemberUuid(result.filing.ack_confirmed_by, actorUuid, allMembers);
      updatePayload.ack_confirmed_at = result.filing.ack_confirmed_at;
    }

    let { error: updateErr } = await supabase
      .from('patent_filings')
      .update(updatePayload)
      .eq('id', filing.id)
      .eq('version', filing.version);

    if (updateErr && updateErr.message?.includes('temp_code')) {
      delete updatePayload.temp_code;
      const retry = await supabase
        .from('patent_filings')
        .update(updatePayload)
        .eq('id', filing.id)
        .eq('version', filing.version);
      updateErr = retry.error;
    }

    if (updateErr) {
      console.warn('Supabase update warning:', updateErr.message);
    }
  } catch (e) {
    console.warn('Supabase update exception:', e);
  }

  // 2. Insert event in Supabase
  try {
    await supabase.from('patent_filing_events').insert([{
      filing_id: filing.id,
      from_status: result.event.from_status,
      to_status: result.event.to_status,
      actor_id: actorUuid,
      timestamp: result.event.timestamp || new Date().toISOString(),
      note: result.event.note || ''
    }]);
  } catch (e) {
    console.warn('Supabase event insert exception:', e);
  }

  // 3. If correction round created or resolved
  if (result.newCorrectionRound) {
    try {
      await supabase.from('patent_correction_rounds').insert([{
        filing_id: filing.id,
        round_no: result.newCorrectionRound.round_no,
        auditor_id: actorUuid,
        description: result.newCorrectionRound.description,
        attachments: result.newCorrectionRound.attachments || [],
        created_at: result.newCorrectionRound.created_at
      }]);
    } catch (e) {
      console.warn('Supabase round insert exception:', e);
    }
  } else if (toStatus === PATENT_STATUSES.AUDIT && payload?.assigneeResponseNote) {
    try {
      await supabase
        .from('patent_correction_rounds')
        .update({
          resolved_by: actorUuid,
          resolved_at: new Date().toISOString(),
          assignee_response: payload.assigneeResponseNote
        })
        .eq('filing_id', filing.id)
        .order('round_no', { ascending: false })
        .limit(1);
    } catch (e) {}
  }

  // 4. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const updatedFilingWithTemp = {
    ...filing,
    ...result.filing,
    temp_code: result.filing.temp_code !== undefined ? result.filing.temp_code : (filing.temp_code || null)
  };
  const nextList = cached.map(f => f.id === filing.id ? updatedFilingWithTemp : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  // Record event locally
  const events = getLocalCache(LOCAL_EVENTS_KEY, []);
  events.push({
    ...result.event,
    actor_name: actor?.name || 'User'
  });
  saveLocalCache(LOCAL_EVENTS_KEY, events);

  // If correction round created locally
  if (result.newCorrectionRound) {
    const rounds = getLocalCache(LOCAL_ROUNDS_KEY, []);
    rounds.push({
      ...result.newCorrectionRound,
      auditor_name: actor?.name || 'Auditor'
    });
    saveLocalCache(LOCAL_ROUNDS_KEY, rounds);
  }

  // 5. Build, persist and broadcast notifications for respective personnel
  const notifications = buildFilingTransitionNotifications({
    filing: result.filing,
    fromStatus,
    toStatus,
    actor,
    payload,
    allMembers
  });

  if (notifications && notifications.length > 0) {
    await savePatentNotificationsToDb(notifications);
  }

  // 6. Broadcast real-time change event across all connected clients
  broadcastPatentChange({
    action: 'TRANSITION',
    filing: result.filing,
    event: result.event,
    notifications,
    fromStatus,
    toStatus,
    actorId: actorUuid,
    actorName: actor?.name || 'User',
    version: result.filing.version
  });

  return { ...result, notifications };
}

/**
 * Reassigns filing with audit logging and Realtime broadcast.
 */
export async function executeReassignInStorage({
  filing,
  newAssigneeId,
  newAuditorId,
  reason,
  actor,
  actorRoles = [],
  allMembers = []
}) {
  const actorUuid = resolveMemberUuid(actor?.id || actor?.name, '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers);
  const newAssigneeUuid = resolveMemberUuid(newAssigneeId, null, allMembers);
  const newAuditorUuid = resolveMemberUuid(newAuditorId, null, allMembers);

  const result = await executeReassign({
    filing,
    expectedVersion: filing.version,
    newAssigneeId: newAssigneeUuid || newAssigneeId,
    newAuditorId: newAuditorUuid || newAuditorId,
    reason,
    actorId: actor?.id,
    actorRoles
  });

  if (!result.success) {
    return result;
  }

  const assigneeMember = allMembers.find(m => String(m.id) === String(newAssigneeUuid));
  const auditorMember = allMembers.find(m => String(m.id) === String(newAuditorUuid));

  const updatedWithNames = {
    ...result.filing,
    assignee_id: newAssigneeUuid,
    auditor_id: newAuditorUuid,
    assignee_name: assigneeMember ? assigneeMember.name : (filing.assignee_name || getKnownMemberName(newAssigneeUuid, 'Assignee')),
    auditor_name: auditorMember ? auditorMember.name : (filing.auditor_name || getKnownMemberName(newAuditorUuid, 'Auditor'))
  };

  // 1. Update in Supabase
  try {
    await supabase
      .from('patent_filings')
      .update({
        assignee_id: newAssigneeUuid,
        auditor_id: newAuditorUuid,
        version: result.filing.version,
        updated_at: result.filing.updated_at
      })
      .eq('id', filing.id)
      .eq('version', filing.version);

    await supabase.from('patent_filing_events').insert([{
      filing_id: filing.id,
      from_status: filing.status,
      to_status: filing.status,
      actor_id: actorUuid,
      timestamp: result.event.timestamp || new Date().toISOString(),
      note: result.event.note
    }]);
  } catch (e) {
    console.warn('Supabase reassign exception:', e);
  }

  // 2. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const nextList = cached.map(f => f.id === filing.id ? updatedWithNames : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  const events = getLocalCache(LOCAL_EVENTS_KEY, []);
  events.push({
    ...result.event,
    actor_name: actor?.name || 'Admin'
  });
  saveLocalCache(LOCAL_EVENTS_KEY, events);

  // 3. Generate & persist reassignment notifications
  const notifications = buildFilingReassignNotifications({
    filing: updatedWithNames,
    previousAssigneeId: filing.assignee_id,
    previousAuditorId: filing.auditor_id,
    newAssigneeId: newAssigneeUuid,
    newAuditorId: newAuditorUuid,
    creatorName: actor?.name || 'Mounisha'
  });
  await savePatentNotificationsToDb(notifications);

  // 4. Broadcast real-time change event
  broadcastPatentChange({
    action: 'REASSIGN',
    filing: updatedWithNames,
    event: result.event,
    notifications,
    previousAssigneeId: filing.assignee_id,
    previousAuditorId: filing.auditor_id,
    actorId: actorUuid,
    actorName: actor?.name || 'Admin',
    version: updatedWithNames.version
  });

  return { success: true, filing: updatedWithNames, event: result.event, notifications };
}

/**
 * Fetches events and correction rounds for a specific filing from Supabase if available,
 * falling back to local cache.
 */
export async function fetchFilingEventsAndRoundsFromDb(filingId, allMembers = []) {
  try {
    const [eventsRes, roundsRes] = await Promise.all([
      supabase
        .from('patent_filing_events')
        .select('*')
        .eq('filing_id', filingId)
        .order('timestamp', { ascending: true }),
      supabase
        .from('patent_correction_rounds')
        .select('*')
        .eq('filing_id', filingId)
        .order('round_no', { ascending: true })
    ]);

    if (!eventsRes.error && eventsRes.data && eventsRes.data.length > 0) {
      const enrichedEvents = eventsRes.data.map(ev => {
        const mem = allMembers.find(m => String(m.id) === String(ev.actor_id));
        return {
          ...ev,
          actor_name: mem ? mem.name : getKnownMemberName(ev.actor_id, 'System')
        };
      });

      const enrichedRounds = (roundsRes.data || []).map(rd => {
        const aud = allMembers.find(m => String(m.id) === String(rd.auditor_id));
        return {
          ...rd,
          auditor_name: aud ? aud.name : getKnownMemberName(rd.auditor_id, 'Auditor')
        };
      });

      return { events: enrichedEvents, rounds: enrichedRounds };
    }
  } catch (e) {}

  return getFilingEventsAndRounds(filingId);
}

/**
 * Fetches events and correction rounds for a specific filing.
 */
export function getFilingEventsAndRounds(filingId) {
  const allEvents = getLocalCache(LOCAL_EVENTS_KEY, []);
  const allRounds = getLocalCache(LOCAL_ROUNDS_KEY, []);

  const filingEvents = allEvents.filter(e => String(e.filing_id) === String(filingId));
  const filingRounds = allRounds.filter(r => String(r.filing_id) === String(filingId));

  return { events: filingEvents, rounds: filingRounds };
}

/**
 * Fetches all unique filing types across all filings in Supabase.
 */
export async function fetchSystemFilingTypes() {
  try {
    const { data, error } = await supabase
      .from('patent_filings')
      .select('filing_type');

    if (!error && Array.isArray(data)) {
      return Array.from(new Set(data.map(d => d.filing_type).filter(Boolean)));
    }
  } catch (e) {
    console.warn('Error fetching system filing types:', e);
  }
  return [];
}

/**
 * Updates a filing's filing_type.
 */
export async function updateFilingTypeInStorage({ filing, newFilingType, actor, allMembers = [] }) {
  const cleanType = (newFilingType || '').trim();
  if (!cleanType) {
    return { success: false, error: 'Filing type cannot be empty.' };
  }

  const newVersion = (filing.version || 1) + 1;
  const nowIso = new Date().toISOString();
  const actorUuid = resolveMemberUuid(actor?.id || actor?.name, '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers);

  // 1. Update in Supabase
  try {
    await supabase
      .from('patent_filings')
      .update({
        filing_type: cleanType,
        version: newVersion,
        updated_at: nowIso
      })
      .eq('id', filing.id)
      .eq('version', filing.version);

    await supabase.from('patent_filing_events').insert([{
      filing_id: filing.id,
      from_status: filing.status,
      to_status: filing.status,
      actor_id: actorUuid,
      timestamp: nowIso,
      note: `Filing type updated from "${filing.filing_type}" to "${cleanType}"`
    }]);
  } catch (e) {
    console.warn('Supabase update filing_type exception:', e);
  }

  // 2. Update local cache
  const updatedFiling = {
    ...filing,
    filing_type: cleanType,
    version: newVersion,
    updated_at: nowIso
  };

  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const nextList = cached.map(f => f.id === filing.id ? updatedFiling : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  // 3. Broadcast real-time change event
  broadcastPatentChange({
    action: 'UPDATE_TYPE',
    filing: updatedFiling,
    actorId: actorUuid,
    actorName: actor?.name || 'Admin',
    version: newVersion
  });

  return { success: true, filing: updatedFiling };
}

/**
 * Permanently deletes a patent filing and its associated events/rounds/notifications.
 * Restricted strictly to Leaders (Mounisha, Pranav Bhat, Sharan).
 */
export async function deleteFilingFromStorage({
  filingId,
  code,
  actor,
  actorRoles = []
}) {
  if (!filingId) {
    return { success: false, error: 'Filing ID is required.' };
  }

  const isLeader = hasPatentRole(actorRoles, PATENT_ROLES.SUPER_ADMIN) ||
    isLeaderOrSharan(actor) ||
    (actor?.role && actor.role.toLowerCase() === 'leader');

  if (!isLeader) {
    return { success: false, error: 'Only firm leaders can delete patent filings.' };
  }

  // 1. Delete dependent records from child tables
  try {
    await supabase.from('patent_correction_rounds').delete().eq('filing_id', filingId);
  } catch (e) {}

  try {
    await supabase.from('patent_filing_events').delete().eq('filing_id', filingId);
  } catch (e) {}

  try {
    await supabase.from('patent_notifications').delete().eq('filing_id', filingId);
  } catch (e) {}

  // 2. Delete parent record from patent_filings
  try {
    const { error } = await supabase.from('patent_filings').delete().eq('id', filingId);
    if (error) {
      console.warn('Error deleting patent filing from Supabase:', error.message);
    }
  } catch (e) {
    console.warn('Exception deleting patent filing:', e);
  }

  // 3. Update local caches
  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const nextList = cached.filter(f => f.id !== filingId);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  const cachedEvents = getLocalCache(LOCAL_EVENTS_KEY, []);
  saveLocalCache(LOCAL_EVENTS_KEY, cachedEvents.filter(e => e.filing_id !== filingId));

  const cachedRounds = getLocalCache(LOCAL_ROUNDS_KEY, []);
  saveLocalCache(LOCAL_ROUNDS_KEY, cachedRounds.filter(r => r.filing_id !== filingId));

  // 4. Broadcast Realtime change event
  broadcastPatentChange({
    action: 'DELETE',
    filingId,
    code,
    actorId: actor?.id,
    actorName: actor?.name || 'Leader'
  });

  return { success: true, filingId, code };
}

/**
 * Updates a filing's temp_code.
 */
export async function updateTempCodeInStorage({ filing, newTempCode, actor, allMembers = [] }) {
  const cleanTemp = (newTempCode || '').trim();
  const newVersion = (filing.version || 1) + 1;
  const nowIso = new Date().toISOString();
  const actorUuid = resolveMemberUuid(actor?.id || actor?.name, '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers);

  // 1. Update in Supabase
  try {
    const updateObj = {
      temp_code: cleanTemp || null,
      version: newVersion,
      updated_at: nowIso
    };
    let { error } = await supabase
      .from('patent_filings')
      .update(updateObj)
      .eq('id', filing.id)
      .eq('version', filing.version);

    if (error && error.message?.includes('temp_code')) {
      // Column not migrated yet in Supabase
    }

    await supabase.from('patent_filing_events').insert([{
      filing_id: filing.id,
      from_status: filing.status,
      to_status: filing.status,
      actor_id: actorUuid,
      timestamp: nowIso,
      note: cleanTemp ? 'Temp Code updated to "' + cleanTemp + '"' : 'Temp Code cleared'
    }]);
  } catch (e) {
    console.warn('Supabase update temp_code exception:', e);
  }

  // 2. Update local cache
  const updatedFiling = {
    ...filing,
    temp_code: cleanTemp || null,
    version: newVersion,
    updated_at: nowIso
  };

  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const nextList = cached.map(f => f.id === filing.id ? updatedFiling : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  // 3. Broadcast real-time change event
  broadcastPatentChange({
    action: 'UPDATE_TEMP_CODE',
    filing: updatedFiling,
    actorId: actorUuid,
    actorName: actor?.name || 'User',
    version: newVersion
  });

  return { success: true, filing: updatedFiling };
}

/**
 * Comprehensive search matching across ALL fields and child records inside a filing card:
 * code, assignee, auditor, temp_code, title, description, filing_notes, filing_type,
 * priority, status, payment_reference, hard_deadline, estimated times,
 * all correction round deficiency notes, assignee responses, round numbers, attachments,
 * and all audit trail event notes.
 */
export function matchFilingSearch(filing, query, allRounds = [], allEvents = []) {
  if (!query || !query.trim()) return true;
  if (!filing) return false;

  const q = query.trim().toLowerCase();

  // 1. Gather all direct properties
  const pieces = [
    filing.code,
    filing.temp_code,
    filing.filing_type,
    filing.title,
    filing.description,
    filing.filing_notes,
    filing.assignee_name,
    filing.auditor_name,
    filing.status,
    filing.priority,
    filing.payment_reference,
    filing.hard_deadline,
    filing.est_filing_minutes ? `${filing.est_filing_minutes}m ${Math.floor(filing.est_filing_minutes / 60)}h` : null,
    filing.est_audit_minutes ? `${filing.est_audit_minutes}m ${Math.floor(filing.est_audit_minutes / 60)}h` : null
  ];

  // 2. Gather all correction round text
  const filingRounds = [
    ...(Array.isArray(filing.correction_rounds) ? filing.correction_rounds : []),
    ...allRounds.filter(r => String(r.filing_id) === String(filing.id))
  ];
  filingRounds.forEach(r => {
    if (r.description) pieces.push(r.description);
    if (r.assignee_response) pieces.push(r.assignee_response);
    if (r.round_no) pieces.push(`round ${r.round_no}`);
    if (Array.isArray(r.attachments)) {
      r.attachments.forEach(att => {
        if (typeof att === 'string') pieces.push(att);
        else if (att?.name) pieces.push(att.name);
      });
    }
  });

  // 3. Gather all event notes and audit history
  const filingEvents = [
    ...(Array.isArray(filing.events) ? filing.events : []),
    ...allEvents.filter(e => String(e.filing_id) === String(filing.id))
  ];
  filingEvents.forEach(e => {
    if (e.note) pieces.push(e.note);
    if (e.actor_name) pieces.push(e.actor_name);
    if (e.from_status) pieces.push(e.from_status);
    if (e.to_status) pieces.push(e.to_status);
  });

  // 4. Combine into searchable text
  const fullText = pieces
    .filter(p => p !== null && p !== undefined)
    .map(p => String(p).toLowerCase())
    .join(' ');

  // Direct substring match
  if (fullText.includes(q)) return true;

  // Multi-term match (every term in query must match somewhere in the card's data)
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every(token => fullText.includes(token))) {
    return true;
  }

  return false;
}

/**
 * Fully updates a patent filing's attributes.
 * Restricted to Super Admin (Mounisha).
 * Only updates fields provided in `updates` and preserves all other previous fields.
 */
export async function updateFilingInStorage({
  filing,
  updates = {},
  actor,
  actorRoles = [],
  allMembers = []
}) {
  if (!filing || !filing.id) {
    return { success: false, error: 'Filing not found.' };
  }

  // 1. Authorization: Only SUPER_ADMIN (Mounisha) or Leaders can execute full card edit
  const isSuperAdmin = hasPatentRole(actorRoles, PATENT_ROLES.SUPER_ADMIN) ||
    (actor?.role && actor.role.toLowerCase() === 'leader') ||
    (actor?.name && actor.name.toLowerCase().includes('mounisha')) ||
    isLeaderOrSharan(actor);

  if (!isSuperAdmin) {
    return { success: false, error: 'Only Super Admin (Mounisha) can edit filing card details.' };
  }

  const actorUuid = resolveMemberUuid(actor?.id || actor?.name, '42a71f9a-7119-457c-8092-0d5b75ce3060', allMembers);
  const nowIso = new Date().toISOString();
  const newVersion = (filing.version || 1) + 1;

  // 2. Validate Assignee != Auditor if both present or updated
  const targetAssigneeId = updates.assignee_id !== undefined ? updates.assignee_id : filing.assignee_id;
  const targetAuditorId = updates.auditor_id !== undefined ? updates.auditor_id : filing.auditor_id;

  if (targetAssigneeId && targetAuditorId && String(targetAssigneeId) === String(targetAuditorId)) {
    return { success: false, error: 'Assignee and auditor must be different team members.' };
  }

  const assigneeUuid = targetAssigneeId ? resolveMemberUuid(targetAssigneeId, targetAssigneeId, allMembers) : filing.assignee_id;
  const auditorUuid = targetAuditorId ? resolveMemberUuid(targetAuditorId, targetAuditorId, allMembers) : filing.auditor_id;

  const assigneeMember = allMembers.find(m => String(m.id) === String(assigneeUuid));
  const auditorMember = allMembers.find(m => String(m.id) === String(auditorUuid));

  const cleanCode = updates.code !== undefined ? (updates.code || '').trim().toUpperCase() : filing.code;
  if (!cleanCode) {
    return { success: false, error: 'Filing code cannot be empty.' };
  }

  const cleanType = updates.filing_type !== undefined ? (updates.filing_type || '').trim() : filing.filing_type;
  if (!cleanType) {
    return { success: false, error: 'Filing type cannot be empty.' };
  }

  // 3. Assemble updated filing object (preserving all previous data)
  const updatedFiling = {
    ...filing,
    code: cleanCode,
    filing_type: cleanType,
    temp_code: updates.temp_code !== undefined ? (updates.temp_code ? String(updates.temp_code).trim() : null) : (filing.temp_code || null),
    title: updates.title !== undefined ? (updates.title ? String(updates.title).trim() : null) : (filing.title || null),
    description: updates.description !== undefined ? (updates.description ? String(updates.description).trim() : null) : (filing.description || null),
    assignee_id: assigneeUuid,
    auditor_id: auditorUuid,
    assignee_name: assigneeMember ? assigneeMember.name : (updates.assignee_name || filing.assignee_name || getKnownMemberName(assigneeUuid, 'Assignee')),
    auditor_name: auditorMember ? auditorMember.name : (updates.auditor_name || filing.auditor_name || getKnownMemberName(auditorUuid, 'Auditor')),
    status: updates.status !== undefined && updates.status ? updates.status : filing.status,
    priority: updates.priority !== undefined && updates.priority ? updates.priority : (filing.priority || 'Medium'),
    est_filing_minutes: updates.est_filing_minutes !== undefined ? Number(updates.est_filing_minutes) || 0 : (filing.est_filing_minutes || 0),
    est_audit_minutes: updates.est_audit_minutes !== undefined ? Number(updates.est_audit_minutes) || 0 : (filing.est_audit_minutes || 0),
    hard_deadline: updates.hard_deadline !== undefined ? (updates.hard_deadline || null) : (filing.hard_deadline || null),
    payment_reference: updates.payment_reference !== undefined ? (updates.payment_reference ? String(updates.payment_reference).trim() : null) : (filing.payment_reference || null),
    version: newVersion,
    updated_at: nowIso
  };

  // 4. Update in Supabase
  try {
    const updatePayload = {
      code: updatedFiling.code,
      filing_type: updatedFiling.filing_type,
      temp_code: updatedFiling.temp_code,
      title: updatedFiling.title || updatedFiling.description || null,
      assignee_id: updatedFiling.assignee_id,
      auditor_id: updatedFiling.auditor_id,
      status: updatedFiling.status,
      priority: updatedFiling.priority,
      est_filing_minutes: updatedFiling.est_filing_minutes,
      est_audit_minutes: updatedFiling.est_audit_minutes,
      hard_deadline: updatedFiling.hard_deadline,
      payment_reference: updatedFiling.payment_reference,
      version: newVersion,
      updated_at: nowIso
    };

    let { error: updateErr } = await supabase
      .from('patent_filings')
      .update(updatePayload)
      .eq('id', filing.id)
      .eq('version', filing.version);

    if (updateErr && (updateErr.message?.includes('temp_code') || updateErr.message?.includes('description'))) {
      if (updateErr.message?.includes('temp_code')) delete updatePayload.temp_code;
      if (updateErr.message?.includes('description')) delete updatePayload.description;
      const retry = await supabase
        .from('patent_filings')
        .update(updatePayload)
        .eq('id', filing.id)
        .eq('version', filing.version);
      updateErr = retry.error;
    }

    if (updateErr) {
      console.warn('Supabase update warning in updateFilingInStorage:', updateErr.message);
    }

    // Insert audit event
    const changesSummary = updates.reason ? `Admin Edit: ${updates.reason}` : 'Filing card updated by Super Admin (Mounisha)';
    await supabase.from('patent_filing_events').insert([{
      filing_id: filing.id,
      from_status: filing.status,
      to_status: updatedFiling.status,
      actor_id: actorUuid,
      timestamp: nowIso,
      note: changesSummary
    }]);
  } catch (err) {
    console.warn('Error in Supabase updateFilingInStorage:', err);
  }

  // 5. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, []);
  const nextList = cached.map(f => f.id === filing.id ? updatedFiling : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  // 6. Broadcast Realtime change event
  broadcastPatentChange({
    action: 'UPDATE_FILING',
    filing: updatedFiling,
    actorId: actorUuid,
    actorName: actor?.name || 'Mounisha',
    version: newVersion
  });

  return { success: true, filing: updatedFiling };
}
