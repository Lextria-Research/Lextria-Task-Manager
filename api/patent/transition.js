// api/patent/transition.js
// Serverless endpoint for Patent Filing state machine transitions & reassignments

import { supabase } from '../../src/supabaseClient.js';
import {
  executeTransition,
  executeReassign,
  PATENT_ROLES
} from '../../src/patent/patentStateMachine.js';
import { getMemberPatentRoles } from '../../src/patent/patentRoles.js';
import { buildFilingReassignNotifications } from '../../src/PatentFiling/patentNotifications.js';

export default async function handler(req, res) {
  // CORS & Methods
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const {
      action = 'transition', // 'transition' | 'reassign'
      filingId,
      expectedVersion,
      toStatus,
      actorId,
      note,
      payload = {},
      newAssigneeId,
      newAuditorId,
      reassignReason
    } = req.body || {};

    if (!actorId) {
      return res.status(401).json({ error: 'Actor ID is required.' });
    }

    if (!filingId) {
      return res.status(400).json({ error: 'Filing ID is required.' });
    }

    // 1. Fetch current filing from database
    const { data: filing, error: fetchErr } = await supabase
      .from('patent_filings')
      .select('*')
      .eq('id', filingId)
      .single();

    if (fetchErr || !filing) {
      return res.status(404).json({ error: 'Filing not found.' });
    }

    // 2. Fetch actor's patent roles
    const { data: roleRecords } = await supabase
      .from('patent_user_roles')
      .select('role')
      .eq('member_id', actorId);

    const actorRoles = (roleRecords || []).map(r => r.role);
    const effectiveActorRoles = actorRoles.length > 0 ? actorRoles : getMemberPatentRoles({ id: actorId });

    // 3. Dispatch action
    if (action === 'reassign') {
      const targetAssigneeId = newAssigneeId || filing.assignee_id;
      const targetAuditorId = newAuditorId || filing.auditor_id;

      // Check role memberships for targets
      const { data: allRoleRecords } = await supabase
        .from('patent_user_roles')
        .select('member_id, role');

      const assigneeRoles = (allRoleRecords || [])
        .filter(r => String(r.member_id) === String(targetAssigneeId))
        .map(r => r.role);
      const effectiveAssigneeRoles = assigneeRoles.length > 0
        ? assigneeRoles
        : getMemberPatentRoles({ id: targetAssigneeId });

      const auditorRoles = (allRoleRecords || [])
        .filter(r => String(r.member_id) === String(targetAuditorId))
        .map(r => r.role);
      const effectiveAuditorRoles = auditorRoles.length > 0
        ? auditorRoles
        : getMemberPatentRoles({ id: targetAuditorId });

      const result = await executeReassign({
        filing,
        expectedVersion,
        newAssigneeId,
        newAuditorId,
        reason: reassignReason || note,
        actorId,
        actorRoles: effectiveActorRoles,
        assigneeRoles: effectiveAssigneeRoles,
        auditorRoles: effectiveAuditorRoles,
        dbClient: supabase
      });

      if (!result.success) {
        return res.status(result.status || 400).json({ error: result.error });
      }

      // Build & persist server-decided notifications for reassignment
      const notifications = buildFilingReassignNotifications({
        filing: result.filing,
        previousAssigneeId: filing.assignee_id,
        previousAuditorId: filing.auditor_id,
        newAssigneeId: result.filing.assignee_id,
        newAuditorId: result.filing.auditor_id,
        creatorName: 'Mounisha'
      });
      try {
        await supabase.from('patent_notifications').insert(notifications.map(n => ({
          recipient_id: n.recipient_id,
          filing_id: n.filing_id,
          code: n.code,
          type: n.type,
          role_type: n.role_type,
          message: n.message,
          read: false,
          created_at: n.created_at
        })));
      } catch (e) {
        console.warn('API reassign notification insert failed:', e);
      }

      return res.status(200).json({
        success: true,
        message: 'Filing reassigned successfully.',
        filing: result.filing,
        event: result.event,
        notifications
      });
    }

    // Fetch actor details
    const { data: actorMember } = await supabase
      .from('members')
      .select('id, name')
      .eq('id', actorId)
      .maybeSingle();

    // Default: State Machine Transition
    const result = await executeTransition({
      filing,
      expectedVersion,
      toStatus,
      actorId,
      actorName: actorMember?.name,
      actor: actorMember,
      actorRoles: effectiveActorRoles,
      note,
      payload,
      dbClient: supabase
    });

    if (!result.success) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(200).json({
      success: true,
      message: `Filing transitioned to ${toStatus} successfully.`,
      filing: result.filing,
      event: result.event,
      correctionRound: result.correctionRound
    });

  } catch (error) {
    console.error('Patent transition endpoint error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error.' });
  }
}
