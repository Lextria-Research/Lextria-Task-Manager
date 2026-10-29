// src/PatentFiling/patentStorage.js
// Client data service for Patent Filing Workflow with optimistic state updates,
// Supabase integration, serverless API dispatch, and robust fallback cache.

import { supabase } from '../supabaseClient.js';
import {
  executeTransition,
  executeReassign,
  PATENT_STATUSES
} from '../patent/patentStateMachine.js';
import { KNOWN_MEMBER_UUIDS } from '../patent/patentRoles.js';
import { broadcastPatentChange } from './patentRealtime.js';

const LOCAL_STORAGE_KEY = 'lextria_patent_filings_cache';
const LOCAL_EVENTS_KEY = 'lextria_patent_events_cache';
const LOCAL_ROUNDS_KEY = 'lextria_patent_rounds_cache';

// Seed demo filings with exact member UUIDs so board is immediately populated & authorized
const DEFAULT_DEMO_FILINGS = [
  {
    id: 'demo-f1',
    code: 'PAT-2026-001',
    filing_type: 'Provisional',
    assignee_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133', // Karthik
    auditor_id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',  // Prathvi
    assignee_name: 'Karthik',
    auditor_name: 'Prathvi',
    est_filing_minutes: 240, // 4 hours
    est_audit_minutes: 60,   // 1 hour
    hard_deadline: '2026-11-15',
    priority: 'High',
    status: PATENT_STATUSES.ASSIGNED,
    version: 1,
    correction_count: 0,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    id: 'demo-f2',
    code: 'PAT-2026-002',
    filing_type: 'PCT International',
    assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
    auditor_id: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d',  // Chaitra
    assignee_name: 'Akshay',
    auditor_name: 'Chaitra',
    est_filing_minutes: 360,
    est_audit_minutes: 90,
    hard_deadline: '2026-11-05',
    priority: 'Urgent',
    status: PATENT_STATUSES.FILING,
    version: 2,
    correction_count: 0,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'demo-f3',
    code: 'PAT-2026-003',
    filing_type: 'Non-Provisional',
    assignee_id: '0a11ce02-42df-4007-b8a7-afcb4b9efe2c', // Kaushal
    auditor_id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',  // Prathvi
    assignee_name: 'Kaushal',
    auditor_name: 'Prathvi',
    est_filing_minutes: 300,
    est_audit_minutes: 60,
    hard_deadline: '2026-11-20',
    priority: 'Medium',
    status: PATENT_STATUSES.AUDIT,
    version: 3,
    correction_count: 0,
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'demo-f4',
    code: 'PAT-2026-004',
    filing_type: 'Design Patent',
    assignee_id: 'f7fe55e4-7c00-4030-86ed-0ccf39737074', // Prashanth
    auditor_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133',  // Karthik
    assignee_name: 'Prashanth',
    auditor_name: 'Karthik',
    est_filing_minutes: 180,
    est_audit_minutes: 45,
    hard_deadline: '2026-11-02',
    priority: 'Urgent',
    status: PATENT_STATUSES.CORRECTION,
    version: 4,
    correction_count: 1,
    created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  {
    id: 'demo-f5',
    code: 'PAT-2026-005',
    filing_type: 'Convention Application',
    assignee_id: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', // Chaitra
    auditor_id: '0a11ce02-42df-4007-b8a7-afcb4b9efe2c',  // Kaushal
    assignee_name: 'Chaitra',
    auditor_name: 'Kaushal',
    est_filing_minutes: 240,
    est_audit_minutes: 60,
    hard_deadline: '2026-11-25',
    priority: 'Medium',
    status: PATENT_STATUSES.PAYMENT,
    version: 5,
    correction_count: 0,
    created_at: new Date(Date.now() - 3600000 * 96).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'demo-f6',
    code: 'PAT-2026-006',
    filing_type: 'National Phase',
    assignee_id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', // Prathvi
    auditor_id: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d',  // Chaitra
    assignee_name: 'Prathvi',
    auditor_name: 'Chaitra',
    est_filing_minutes: 400,
    est_audit_minutes: 120,
    hard_deadline: '2026-11-08',
    priority: 'High',
    status: PATENT_STATUSES.ACK,
    version: 6,
    payment_reference: 'IPO-CH-2026-88192',
    payment_confirmed_by: 'Mounisha',
    payment_confirmed_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    correction_count: 1,
    created_at: new Date(Date.now() - 3600000 * 120).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 8).toISOString()
  }
];

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
 * Loads all filings. First queries Supabase, falls back to local cache/demo data if table is not yet in Supabase.
 */
export async function loadFilingsFromStorage(allMembers = []) {
  try {
    const { data, error } = await supabase
      .from('patent_filings')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      // Map names from allMembers or known UUIDs
      const enriched = data.map(f => {
        const a = allMembers.find(m => String(m.id) === String(f.assignee_id));
        const u = allMembers.find(m => String(m.id) === String(f.auditor_id));
        return {
          ...f,
          assignee_name: a ? a.name : (f.assignee_name || getKnownMemberName(f.assignee_id, 'Assignee')),
          auditor_name: u ? u.name : (f.auditor_name || getKnownMemberName(f.auditor_id, 'Auditor'))
        };
      });
      saveLocalCache(LOCAL_STORAGE_KEY, enriched);
      return enriched;
    }
  } catch (err) {
    console.warn('Error loading filings from Supabase:', err);
  }

  // Helper to normalize filings and resolve real member UUIDs
  const normalizeFilings = (list) => {
    return list.map(f => {
      let aId = f.assignee_id;
      let uId = f.auditor_id;
      let aName = f.assignee_name;
      let uName = f.auditor_name;

      const matchAssignee = allMembers.find(m => String(m.id) === String(aId) || (aName && m.name && m.name.toLowerCase().includes(aName.toLowerCase())));
      if (matchAssignee) {
        aId = matchAssignee.id;
        aName = matchAssignee.name;
      } else if (aName) {
        const key = aName.trim().toLowerCase();
        for (const [nameKey, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
          if (key.includes(nameKey)) { aId = uuid; break; }
        }
      }

      const matchAuditor = allMembers.find(m => String(m.id) === String(uId) || (uName && m.name && m.name.toLowerCase().includes(uName.toLowerCase())));
      if (matchAuditor) {
        uId = matchAuditor.id;
        uName = matchAuditor.name;
      } else if (uName) {
        const key = uName.trim().toLowerCase();
        for (const [nameKey, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
          if (key.includes(nameKey)) { uId = uuid; break; }
        }
      }

      return {
        ...f,
        assignee_id: aId,
        auditor_id: uId,
        assignee_name: aName || getKnownMemberName(aId, 'Assignee'),
        auditor_name: uName || getKnownMemberName(uId, 'Auditor')
      };
    });
  };

  // Fallback to local cache or defaults (always normalized)
  const cached = getLocalCache(LOCAL_STORAGE_KEY, null);
  if (cached && cached.length > 0) {
    const normalized = normalizeFilings(cached);
    saveLocalCache(LOCAL_STORAGE_KEY, normalized);
    return normalized;
  }

  const mappedDemo = normalizeFilings(DEFAULT_DEMO_FILINGS);
  saveLocalCache(LOCAL_STORAGE_KEY, mappedDemo);
  return mappedDemo;
}

/**
 * Creates a new filing.
 */
export async function saveNewFilingToStorage(filingData, actor, allMembers = []) {
  const cleanCode = filingData.code.trim().toUpperCase();
  const nowIso = new Date().toISOString();

  const assigneeMember = allMembers.find(m => String(m.id) === String(filingData.assignee_id));
  const auditorMember = allMembers.find(m => String(m.id) === String(filingData.auditor_id));

  const newRecord = {
    id: `filing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: cleanCode,
    filing_type: filingData.filing_type,
    title: filingData.title || null,
    assignee_id: filingData.assignee_id,
    auditor_id: filingData.auditor_id,
    assignee_name: assigneeMember ? assigneeMember.name : 'Assignee',
    auditor_name: auditorMember ? auditorMember.name : 'Auditor',
    est_filing_minutes: Number(filingData.est_filing_minutes) || 0,
    est_audit_minutes: Number(filingData.est_audit_minutes) || 0,
    hard_deadline: filingData.hard_deadline || null,
    priority: filingData.priority || 'Medium',
    status: PATENT_STATUSES.ASSIGNED,
    version: 1,
    correction_count: 0,
    created_by: actor.id,
    created_at: nowIso,
    updated_at: nowIso
  };

  // 1. Insert into Supabase
  try {
    const { data, error } = await supabase
      .from('patent_filings')
      .insert([{
        code: newRecord.code,
        filing_type: newRecord.filing_type,
        title: newRecord.title,
        assignee_id: newRecord.assignee_id,
        auditor_id: newRecord.auditor_id,
        est_filing_minutes: newRecord.est_filing_minutes,
        est_audit_minutes: newRecord.est_audit_minutes,
        hard_deadline: newRecord.hard_deadline,
        priority: newRecord.priority,
        status: newRecord.status,
        version: 1,
        created_by: actor.id
      }])
      .select()
      .single();

    if (!error && data) {
      newRecord.id = data.id;
      newRecord.version = data.version;
    } else if (error) {
      console.warn('Supabase insert warning:', error.message);
    }
  } catch (e) {
    console.warn('Supabase insert exception:', e);
  }

  // 2. Initial event
  const initialEvent = {
    filing_id: newRecord.id,
    from_status: null,
    to_status: PATENT_STATUSES.ASSIGNED,
    actor_id: actor.id,
    actor_name: actor.name,
    timestamp: nowIso,
    note: 'Filing created and assigned by Super Admin'
  };

  try {
    await supabase.from('patent_filing_events').insert([{
      filing_id: newRecord.id,
      from_status: null,
      to_status: PATENT_STATUSES.ASSIGNED,
      actor_id: actor.id,
      timestamp: nowIso,
      note: initialEvent.note
    }]);
  } catch (e) {}

  // 3. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, DEFAULT_DEMO_FILINGS);
  const updated = [newRecord, ...cached];
  saveLocalCache(LOCAL_STORAGE_KEY, updated);

  const events = getLocalCache(LOCAL_EVENTS_KEY, []);
  events.push(initialEvent);
  saveLocalCache(LOCAL_EVENTS_KEY, events);

  // 4. Broadcast real-time change event across all connected clients
  broadcastPatentChange({
    action: 'CREATE',
    filing: newRecord,
    event: initialEvent,
    actorId: actor.id,
    actorName: actor.name,
    version: newRecord.version
  });

  return { success: true, filing: newRecord };
}

/**
 * Executes a transition.
 */
export async function executeTransitionInStorage({
  filing,
  toStatus,
  actor,
  actorRoles = [],
  note = '',
  payload = {}
}) {
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
    const { error: updateErr } = await supabase
      .from('patent_filings')
      .update({
        status: result.filing.status,
        version: result.filing.version,
        correction_count: result.filing.correction_count,
        payment_reference: result.filing.payment_reference,
        payment_confirmed_by: result.filing.payment_confirmed_by,
        payment_confirmed_at: result.filing.payment_confirmed_at,
        ack_confirmed_by: result.filing.ack_confirmed_by,
        ack_confirmed_at: result.filing.ack_confirmed_at,
        updated_at: result.filing.updated_at
      })
      .eq('id', filing.id)
      .eq('version', filing.version);

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
      actor_id: actor.id,
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
        auditor_id: actor.id,
        description: result.newCorrectionRound.description,
        attachments: result.newCorrectionRound.attachments || [],
        created_at: result.newCorrectionRound.created_at
      }]);
    } catch (e) {
      console.warn('Supabase round insert exception:', e);
    }
  } else if (toStatus === PATENT_STATUSES.AUDIT && payload?.assigneeResponseNote) {
    // Round resolved / responded
    try {
      await supabase
        .from('patent_correction_rounds')
        .update({
          resolved_by: actor.id,
          resolved_at: new Date().toISOString(),
          assignee_response: payload.assigneeResponseNote
        })
        .eq('filing_id', filing.id)
        .order('round_no', { ascending: false })
        .limit(1);
    } catch (e) {}
  }

  // 4. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, DEFAULT_DEMO_FILINGS);
  const nextList = cached.map(f => f.id === filing.id ? { ...f, ...result.filing } : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  // Record event locally
  const events = getLocalCache(LOCAL_EVENTS_KEY, []);
  events.push({
    ...result.event,
    actor_name: actor.name
  });
  saveLocalCache(LOCAL_EVENTS_KEY, events);

  // If correction round created locally
  if (result.newCorrectionRound) {
    const rounds = getLocalCache(LOCAL_ROUNDS_KEY, []);
    rounds.push({
      ...result.newCorrectionRound,
      auditor_name: actor.name
    });
    saveLocalCache(LOCAL_ROUNDS_KEY, rounds);
  }

  // 5. Broadcast real-time change event across all connected clients
  broadcastPatentChange({
    action: 'TRANSITION',
    filing: result.filing,
    event: result.event,
    actorId: actor?.id,
    actorName: actor?.name,
    version: result.filing.version
  });

  return result;
}

/**
 * Reassigns filing.
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
  const result = await executeReassign({
    filing,
    expectedVersion: filing.version,
    newAssigneeId,
    newAuditorId,
    reason,
    actorId: actor.id,
    actorRoles
  });

  if (!result.success) {
    return result;
  }

  const assigneeMember = allMembers.find(m => String(m.id) === String(result.filing.assignee_id));
  const auditorMember = allMembers.find(m => String(m.id) === String(result.filing.auditor_id));

  const updatedWithNames = {
    ...result.filing,
    assignee_name: assigneeMember ? assigneeMember.name : (filing.assignee_name || getKnownMemberName(result.filing.assignee_id, 'Assignee')),
    auditor_name: auditorMember ? auditorMember.name : (filing.auditor_name || getKnownMemberName(result.filing.auditor_id, 'Auditor'))
  };

  // 1. Update in Supabase
  try {
    await supabase
      .from('patent_filings')
      .update({
        assignee_id: result.filing.assignee_id,
        auditor_id: result.filing.auditor_id,
        version: result.filing.version,
        updated_at: result.filing.updated_at
      })
      .eq('id', filing.id)
      .eq('version', filing.version);

    await supabase.from('patent_filing_events').insert([{
      filing_id: filing.id,
      from_status: filing.status,
      to_status: filing.status,
      actor_id: actor.id,
      timestamp: result.event.timestamp || new Date().toISOString(),
      note: result.event.note
    }]);
  } catch (e) {
    console.warn('Supabase reassign exception:', e);
  }

  // 2. Update local cache
  const cached = getLocalCache(LOCAL_STORAGE_KEY, DEFAULT_DEMO_FILINGS);
  const nextList = cached.map(f => f.id === filing.id ? updatedWithNames : f);
  saveLocalCache(LOCAL_STORAGE_KEY, nextList);

  const events = getLocalCache(LOCAL_EVENTS_KEY, []);
  events.push({
    ...result.event,
    actor_name: actor.name
  });
  saveLocalCache(LOCAL_EVENTS_KEY, events);

  // 3. Broadcast real-time change event
  broadcastPatentChange({
    action: 'REASSIGN',
    filing: updatedWithNames,
    event: result.event,
    previousAssigneeId: filing.assignee_id,
    previousAuditorId: filing.auditor_id,
    actorId: actor.id,
    actorName: actor.name,
    version: updatedWithNames.version
  });

  return { success: true, filing: updatedWithNames, event: result.event };
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
