// src/patent/patentRoles.js
// Utility to resolve and check Patent Workflow roles for the logged-in user

import { supabase } from '../supabaseClient.js';
import { PATENT_ROLES } from './patentStateMachine.js';

export const SEED_ROLE_ASSIGNMENTS = {
  SUPER_ADMIN: ['Mounisha'],
  ASSIGNEE: ['Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi'],
  AUDITOR: ['Prathvi', 'Chaitra', 'Kaushal', 'Karthik'],
  ACK_CHECKER: ['Prashanth']
};

/**
 * Resolves patent module roles for a given member.
 * Checks patent_user_roles table, and falls back to seed mappings if table is not yet migrated.
 */
export async function fetchUserPatentRoles(user) {
  if (!user) return [];

  const userName = (user.name || '').trim().toLowerCase();
  const userId = user.id;

  try {
    // 1. Try querying Supabase patent_user_roles
    if (userId) {
      const { data, error } = await supabase
        .from('patent_user_roles')
        .select('role')
        .eq('member_id', userId);

      if (!error && data && data.length > 0) {
        return data.map(r => r.role);
      }
    }
  } catch (err) {
    // Supabase query failed or table not found
  }

  // 2. Fallback to data-driven seed mapping by member name
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

  // Executive leader convenience: Pranav Bhat and Sharan also get SUPER_ADMIN for testing/oversight
  if (userName.includes('pranav') || userName.includes('sharan')) {
    if (!matchedRoles.includes(PATENT_ROLES.SUPER_ADMIN)) {
      matchedRoles.push(PATENT_ROLES.SUPER_ADMIN);
    }
  }

  return matchedRoles;
}

/**
 * Synchronous role resolution from seed data for instant initial rendering.
 */
export function getInitialPatentRoles(user) {
  if (!user) return [];
  const userName = (user.name || '').trim().toLowerCase();
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

  if (userName.includes('pranav') || userName.includes('sharan')) {
    if (!matchedRoles.includes(PATENT_ROLES.SUPER_ADMIN)) {
      matchedRoles.push(PATENT_ROLES.SUPER_ADMIN);
    }
  }

  return matchedRoles;
}
