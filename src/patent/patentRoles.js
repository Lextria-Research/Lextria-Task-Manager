// src/patent/patentRoles.js
// Utility to resolve and check Patent Workflow roles for team members
// Data-driven with fallback to exact UUID & name-based seed data.

import { supabase } from '../supabaseClient.js';
import { PATENT_ROLES } from './patentStateMachine.js';

// Exact 1:1 UUID mapping from members table
export const SEED_MEMBER_ROLES = {
  '42a71f9a-7119-457c-8092-0d5b75ce3060': [PATENT_ROLES.SUPER_ADMIN], // Mounisha
  'f7fe55e4-7c00-4030-86ed-0ccf39737074': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.ACK_CHECKER], // Prashanth
  '396ee572-3f3b-47cc-8b11-d710cc8ed4bc': [PATENT_ROLES.ASSIGNEE], // Akshay
  'a6ecc962-3946-41ea-9946-1ff6dcc08133': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Karthik
  'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Chaitra
  '0a11ce02-42df-4007-b8a7-afcb4b9efe2c': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR], // Kaushal
  '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8': [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR]  // Prathvi
};

export const SEED_ROLE_ASSIGNMENTS = {
  SUPER_ADMIN: ['Mounisha'],
  ASSIGNEE: ['Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi'],
  AUDITOR: ['Prathvi', 'Chaitra', 'Kaushal', 'Karthik'],
  ACK_CHECKER: ['Prashanth']
};

/**
 * Resolves patent module roles for a member using live DB records or fallback seeds.
 * @param {Object} user - Member object with id and/or name
 * @param {Array} [roleRecords] - Optional pre-fetched records from patent_user_roles table
 */
export function getMemberPatentRoles(user, roleRecords = null) {
  if (!user) return [];

  const userId = String(user.id || user.member_id || '');
  const userName = (user.name || '').trim().toLowerCase();

  // 1. If live DB role records were supplied, use them (fully dynamic, data-driven)
  if (Array.isArray(roleRecords) && roleRecords.length > 0 && userId) {
    const dbRoles = roleRecords
      .filter(r => String(r.member_id) === userId)
      .map(r => r.role);
    if (dbRoles.length > 0) return dbRoles;
  }

  // 2. Check exact UUID seed map
  if (userId && SEED_MEMBER_ROLES[userId]) {
    return SEED_MEMBER_ROLES[userId];
  }

  // 3. Fallback to name-based seed mapping
  const matchedRoles = [];
  for (const [role, names] of Object.entries(SEED_ROLE_ASSIGNMENTS)) {
    const hasName = names.some(n => {
      const clean = n.trim().toLowerCase();
      return userName === clean || userName.replace(/\s+/g, '') === clean.replace(/\s+/g, '');
    });
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

  return matchedRoles;
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

  const userId = user.id;

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
