// api/patent/roles.js
// Serverless endpoint for managing Patent Workflow user roles

import { supabase } from '../../src/supabaseClient.js';
import { PATENT_ROLES } from '../../src/patent/patentStateMachine.js';

export default async function handler(req, res) {
  const method = req.method;

  // 1. GET: Fetch roles for an actor or all members
  if (method === 'GET') {
    try {
      const { actorId, all = 'false' } = req.query || {};

      if (!actorId) {
        return res.status(401).json({ error: 'Actor ID is required.' });
      }

      // Check current actor's roles
      const { data: actorRoleRecords } = await supabase
        .from('patent_user_roles')
        .select('role')
        .eq('member_id', actorId);

      const actorRoles = (actorRoleRecords || []).map(r => r.role);
      const isSuperAdmin = actorRoles.includes(PATENT_ROLES.SUPER_ADMIN);

      // If actor requested all role assignments (only allowed for SUPER_ADMIN or general roster view)
      if (all === 'true') {
        const { data: allRoles, error: allErr } = await supabase
          .from('patent_user_roles')
          .select(`
            id,
            role,
            member_id,
            member:members(id, name)
          `);

        if (allErr) {
          return res.status(500).json({ error: allErr.message });
        }

        return res.status(200).json({
          success: true,
          actorRoles,
          isSuperAdmin,
          roleAssignments: allRoles || []
        });
      }

      return res.status(200).json({
        success: true,
        actorRoles,
        isSuperAdmin
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 2. POST: Update or grant/revoke roles (SUPER_ADMIN only)
  if (method === 'POST') {
    try {
      const { actorId, targetMemberId, roles = [] } = req.body || {};

      if (!actorId) {
        return res.status(401).json({ error: 'Actor ID is required.' });
      }

      if (!targetMemberId) {
        return res.status(400).json({ error: 'Target member ID is required.' });
      }

      // Verify SUPER_ADMIN role
      const { data: actorRoleRecords } = await supabase
        .from('patent_user_roles')
        .select('role')
        .eq('member_id', actorId);

      const actorRoles = (actorRoleRecords || []).map(r => r.role);
      if (!actorRoles.includes(PATENT_ROLES.SUPER_ADMIN)) {
        return res.status(403).json({ error: 'Only SUPER_ADMIN can modify Patent module roles.' });
      }

      // Validate roles list
      const validRoles = Object.values(PATENT_ROLES);
      for (const r of roles) {
        if (!validRoles.includes(r)) {
          return res.status(400).json({ error: `Invalid role: ${r}` });
        }
      }

      // Delete existing roles for target member
      await supabase
        .from('patent_user_roles')
        .delete()
        .eq('member_id', targetMemberId);

      // Insert new roles
      if (roles.length > 0) {
        const toInsert = roles.map(role => ({
          member_id: targetMemberId,
          role
        }));

        const { data: inserted, error: insertErr } = await supabase
          .from('patent_user_roles')
          .insert(toInsert)
          .select();

        if (insertErr) {
          return res.status(500).json({ error: insertErr.message });
        }

        return res.status(200).json({
          success: true,
          message: 'Roles updated successfully.',
          roles: inserted
        });
      }

      return res.status(200).json({
        success: true,
        message: 'All module roles removed for member.',
        roles: []
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
