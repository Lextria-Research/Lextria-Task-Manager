// src/patent/patentRoles.js
// Utility to resolve and check Patent Workflow roles for team members
// Data-driven with fallback to exact UUID & name-based seed data.

import { supabase } from '../supabaseClient.js';

export const PATENT_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ASSIGNEE: 'ASSIGNEE',
  AUDITOR: 'AUDITOR',
  ACK_CHECKER: 'ACK_CHECKER'
};

// Exact 1:1 UUID mapping from members table
export const SEED_MEMBER_ROLES = {
  '42a71f9a-7119-457c-8092-0d5b75ce3060': [PATENT_ROLES.SUPER_ADMIN], // Mounisha
  'f7fe55e4-7c00-4030-86ed-0ccf39737074': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.ACK_CHECKER], // Prashanth
  '396ee572-3f3b-47cc-8b11-d710cc8ed4bc': [PATENT_ROLES.ASSIGNEE], // Akshay
  'a6ecc962-3946-41ea-9946-1ff6dcc08133': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Karthik
  'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Chaitra
  '0a11ce02-42df-4007-b8a7-afcb4b9efe2c': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Kaushal
  '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Prathvi
  '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad': [PATENT_ROLES.ASSIGNEE]  // Nikhil
};

export const SEED_ROLE_ASSIGNMENTS = {
  SUPER_ADMIN: ['Mounisha'],
  ASSIGNEE: ['Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi', 'Nikhil'],
  AUDITOR: ['Prathvi', 'Chaitra', 'Kaushal', 'Karthik'],
  ACK_CHECKER: ['Prashanth']
};

export const KNOWN_MEMBER_UUIDS = {
  mounisha: '42a71f9a-7119-457c-8092-0d5b75ce3060',
  prashanth: 'f7fe55e4-7c00-4030-86ed-0ccf39737074',
  akshay: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
  karthik: 'a6ecc962-3946-41ea-9946-1ff6dcc08133',
  chaitra: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d',
  kaushal: '0a11ce02-42df-4007-b8a7-afcb4b9efe2c',
  prathvi: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',
  nikhil: '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad'
};

// Maps department agents IDs to canonical members(id) UUIDs
export const KNOWN_AGENT_TO_MEMBER_UUIDS = {
  'eafcd62c-fc86-4e25-971e-343c14a2cf36': '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay / Akshaya
  '5e4b1fe1-5ec5-4a44-b89c-a24d6a1f9b0f': '0a11ce02-42df-4007-b8a7-afcb4b9efe2c', // Kaushal / Kaushal Kamath
  '923eeac5-35a5-461e-af6f-719f32d30281': 'a6ecc962-3946-41ea-9946-1ff6dcc08133', // Karthik
  'fb937e40-077b-46ff-a2a7-8942f09d9f59': 'f7fe55e4-7c00-4030-86ed-0ccf39737074', // Prashanth
  'f7c5a4e8-94b4-4510-8c47-2b7c2d9c90ca': '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', // Prathvi
  '2ff5eac9-31ad-43da-ac65-fcfa4792bc35': 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', // Chaitra
  '890be412-39de-4420-bed3-a70516e21469': '42a71f9a-7119-457c-8092-0d5b75ce3060', // Mounisha
  '99c4cf52-cda0-4e46-99e6-e55e0f7f49b1': '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad'  // Nikhil
};

/**
 * Checks if two member name strings represent the same person.
 */
export function isSameMemberName(nameA = '', nameB = '') {
  if (!nameA || !nameB) return false;
  const a = nameA.trim().toLowerCase().replace(/\s+/g, '');
  const b = nameB.trim().toLowerCase().replace(/\s+/g, '');
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  if ((a === 'akshay' && b === 'akshaya') || (a === 'akshaya' && b === 'akshay')) return true;
  if (a.startsWith('kaushal') && b.startsWith('kaushal')) return true;
  if (a.startsWith('nikhil') && b.startsWith('nikhil')) return true;
  return false;
}

/**
 * Returns canonical user member UUID from members(id) regardless of whether
 * an agent ID, member UUID, or name string was passed.
 */
export function getCanonicalMemberUuid(user) {
  if (!user) return null;
  const rawId = String(user.id || user.member_id || '').toLowerCase().trim();
  const rawName = String(user.name || '').toLowerCase().trim();

  // 1. Direct agent-to-member map
  if (KNOWN_AGENT_TO_MEMBER_UUIDS[rawId]) {
    return KNOWN_AGENT_TO_MEMBER_UUIDS[rawId];
  }

  // 2. Direct check against known member UUIDs
  for (const [key, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
    if (rawId === uuid.toLowerCase() || rawId === `user_${key}`) {
      return uuid;
    }
  }

  // 3. Name-based match using isSameMemberName
  for (const [key, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
    if (isSameMemberName(rawName, key)) {
      return uuid;
    }
  }

  return rawId || null;
}

/**
 * Formats a clean display name for team members.
 */
export function getCleanMemberName(member) {
  if (!member) return '';
  const n = (member.name || '').trim();
  if (isSameMemberName(n, 'Akshay')) return 'Akshay';
  if (isSameMemberName(n, 'Kaushal')) return 'Kaushal';
  if (isSameMemberName(n, 'Nikhil')) return 'Nikhil';
  return n;
}

/**
 * Robust identity matcher: checks matching by UUID, name, or legacy alias
 */
export function isMemberMatch(actorId, actorName, targetMemberId, targetMemberName) {
  const cleanActorId = String(actorId || '').toLowerCase().trim();
  const cleanTargetId = String(targetMemberId || '').toLowerCase().trim();

  // 1. Exact ID match
  if (cleanActorId && cleanTargetId && cleanActorId === cleanTargetId) return true;

  // 2. Canonical UUID match
  const cActor = getCanonicalMemberUuid({ id: cleanActorId, name: actorName });
  const cTarget = getCanonicalMemberUuid({ id: cleanTargetId, name: targetMemberName });
  if (cActor && cTarget && cActor.toLowerCase() === cTarget.toLowerCase()) return true;

  // 3. Exact or fuzzy name match
  if (actorName && targetMemberName && isSameMemberName(actorName, targetMemberName)) return true;

  // 4. Known UUID / Legacy ID alias cross-match
  const aName = (actorName || '').trim().toLowerCase();
  const tName = (targetMemberName || '').trim().toLowerCase();

  for (const [key, uuid] of Object.entries(KNOWN_MEMBER_UUIDS)) {
    const isActorThisPerson = cleanActorId === uuid || cleanActorId === `user_${key}` || aName.includes(key);
    const isTargetThisPerson = cleanTargetId === uuid || cleanTargetId === `user_${key}` || tName.includes(key);
    if (isActorThisPerson && isTargetThisPerson) return true;
  }

  return false;
}

/**
 * Resolves patent module roles for a member using live DB records or fallback seeds.
 * @param {Object} user - Member object with id and/or name
 * @param {Array} [roleRecords] - Optional pre-fetched records from patent_user_roles table
 */
export function getMemberPatentRoles(user, roleRecords = null) {
  if (!user) return [];

  const userId = String(user.id || user.member_id || '').trim();
  const userName = (user.name || '').trim().toLowerCase();
  const canonicalUuid = getCanonicalMemberUuid(user);

  // 1. If live DB role records were supplied, use them (fully dynamic, data-driven)
  if (Array.isArray(roleRecords) && roleRecords.length > 0) {
    const dbRoles = roleRecords
      .filter(r => {
        const mid = String(r.member_id || '').trim().toLowerCase();
        return (userId && mid === userId.toLowerCase()) ||
               (canonicalUuid && mid === canonicalUuid.toLowerCase());
      })
      .map(r => r.role);
    if (dbRoles.length > 0) return Array.from(new Set(dbRoles));
  }

  // 2. Check exact UUID seed map
  if (canonicalUuid && SEED_MEMBER_ROLES[canonicalUuid]) {
    return SEED_MEMBER_ROLES[canonicalUuid];
  }
  if (userId && SEED_MEMBER_ROLES[userId]) {
    return SEED_MEMBER_ROLES[userId];
  }

  // 3. Fallback to name-based seed mapping
  const matchedRoles = [];
  for (const [role, names] of Object.entries(SEED_ROLE_ASSIGNMENTS)) {
    const hasName = names.some(n => isSameMemberName(userName, n));
    if (hasName) {
      matchedRoles.push(role);
    }
  }

  // Executive leader convenience for testing/oversight
  if (userName.includes('pranav') || userName.includes('sharan')) {
    if (!matchedRoles.includes(PATENT_ROLES.SUPER_ADMIN)) {
      matchedRoles.push(PATENT_ROLES.SUPER_ADMIN);
    }
  }

  return Array.from(new Set(matchedRoles));
}

/**
 * Checks if a member holds a specific role in Patent Workflow.
 */
export function memberHasPatentRole(user, targetRole, roleRecords = null) {
  const roles = getMemberPatentRoles(user, roleRecords);
  return roles.includes(targetRole);
}

/**
 * Filters a list of members returning only those who hold the target role.
 * Role-driven, never hardcoded in UI.
 */
export function filterMembersByPatentRole(allMembers = [], targetRole, roleRecords = null) {
  if (!Array.isArray(allMembers)) return [];
  return allMembers.filter(m => memberHasPatentRole(m, targetRole, roleRecords));
}

/**
 * Fetches all role records from the patent_user_roles table.
 */
export async function fetchAllPatentRoleRecords(client = supabase) {
  try {
    const { data, error } = await client
      .from('patent_user_roles')
      .select('member_id, role');

    if (!error && Array.isArray(data)) {
      return data;
    }
  } catch (e) {
    // Table not migrated yet or network error
  }
  return null;
}

/**
 * Resolves patent module roles for a single user (asynchronous).
 */
export async function fetchUserPatentRoles(user) {
  if (!user) return [];

  const canonicalId = getCanonicalMemberUuid(user);
  const userId = canonicalId || user.id;

  try {
    if (userId) {
      const { data, error } = await supabase
        .from('patent_user_roles')
        .select('role')
        .eq('member_id', userId);

      if (!error && data && data.length > 0) {
        return data.map(r => r.role);
      }
    }
  } catch (err) {}

  return getMemberPatentRoles(user);
}

/**
 * Synchronous initial role resolution for fast rendering.
 */
export function getInitialPatentRoles(user) {
  return getMemberPatentRoles(user);
}
