// api/patent/filings.js
// Serverless endpoint for listing and creating patent filings

import { supabase } from '../../src/supabaseClient.js';
import {
  validateFilingCreation,
  PATENT_ROLES,
  PATENT_STATUSES
} from '../../src/patent/patentStateMachine.js';
import { getMemberPatentRoles } from '../../src/patent/patentRoles.js';

export default async function handler(req, res) {
  const method = req.method;

  // 1. GET: List filings
  if (method === 'GET') {
    try {
      const { actorId, view = 'default' } = req.query || {};

      if (!actorId) {
        return res.status(401).json({ error: 'Actor ID is required.' });
      }

      // Fetch actor roles
      const { data: roleRecords } = await supabase
        .from('patent_user_roles')
        .select('role')
        .eq('member_id', actorId);

      const roles = (roleRecords || []).map(r => r.role);
      const isSuperAdmin = roles.includes(PATENT_ROLES.SUPER_ADMIN);

      let query = supabase
        .from('patent_filings')
        .select(`
          *,
          assignee:members!patent_filings_assignee_id_fkey(id, name),
          auditor:members!patent_filings_auditor_id_fkey(id, name)
        `)
        .order('created_at', { ascending: false });

      const { data: filings, error } = await query;

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // Fetch latest events and correction rounds count
      return res.status(200).json({
        success: true,
        filings: filings || [],
        userRoles: roles,
        isSuperAdmin
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 2. POST: Create a new filing (SUPER_ADMIN only)
  if (method === 'POST') {
    try {
      const {
        code,
        filing_type,
        title,
        assignee_id,
        auditor_id,
        est_filing_minutes = 0,
        est_audit_minutes = 0,
        hard_deadline,
        priority = 'Medium',
        actorId
      } = req.body || {};

      if (!actorId) {
        return res.status(401).json({ error: 'Actor ID is required.' });
      }

      // Fetch all role records to verify actor, assignee, and auditor roles
      const { data: allRoleRecords } = await supabase
        .from('patent_user_roles')
        .select('member_id, role');

      const actorRoles = (allRoleRecords || [])
        .filter(r => String(r.member_id) === String(actorId))
        .map(r => r.role);
      const effectiveActorRoles = actorRoles.length > 0
        ? actorRoles
        : getMemberPatentRoles({ id: actorId });

      const assigneeRoles = (allRoleRecords || [])
        .filter(r => String(r.member_id) === String(assignee_id))
        .map(r => r.role);
      const effectiveAssigneeRoles = assigneeRoles.length > 0
        ? assigneeRoles
        : getMemberPatentRoles({ id: assignee_id });

      const auditorRoles = (allRoleRecords || [])
        .filter(r => String(r.member_id) === String(auditor_id))
        .map(r => r.role);
      const effectiveAuditorRoles = auditorRoles.length > 0
        ? auditorRoles
        : getMemberPatentRoles({ id: auditor_id });

      const validation = validateFilingCreation({
        code,
        filing_type,
        assignee_id,
        auditor_id,
        est_filing_minutes: Number(est_filing_minutes),
        est_audit_minutes: Number(est_audit_minutes),
        actorRoles: effectiveActorRoles,
        assigneeRoles: effectiveAssigneeRoles,
        auditorRoles: effectiveAuditorRoles
      });

      if (!validation.valid) {
        return res.status(validation.status || 400).json({ error: validation.error });
      }

      const cleanCode = code.trim().toUpperCase();

      // Check unique code
      const { data: existingCode } = await supabase
        .from('patent_filings')
        .select('id')
        .eq('code', cleanCode)
        .maybeSingle();

      if (existingCode) {
        return res.status(400).json({ error: `Filing code "${cleanCode}" is already in use. Codes must be unique.` });
      }

      const nowIso = new Date().toISOString();

      const newFiling = {
        code: cleanCode,
        filing_type: filing_type.trim(),
        title: title ? title.trim() : null,
        assignee_id,
        auditor_id,
        est_filing_minutes: Number(est_filing_minutes),
        est_audit_minutes: Number(est_audit_minutes),
        hard_deadline: hard_deadline || null,
        priority,
        status: PATENT_STATUSES.ASSIGNED,
        version: 1,
        correction_count: 0,
        created_by: actorId,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: created, error: insertErr } = await supabase
        .from('patent_filings')
        .insert([newFiling])
        .select()
        .single();

      if (insertErr || !created) {
        return res.status(500).json({ error: insertErr?.message || 'Could not insert filing.' });
      }

      // Initial FilingEvent
      await supabase.from('patent_filing_events').insert([{
        filing_id: created.id,
        from_status: null,
        to_status: PATENT_STATUSES.ASSIGNED,
        actor_id: actorId,
        timestamp: nowIso,
        note: 'Filing created and assigned by Super Admin'
      }]);

      return res.status(201).json({
        success: true,
        message: 'Filing created successfully.',
        filing: created
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
