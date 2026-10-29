// api/patent/transition.js
// Serverless endpoint for Patent Filing state machine transitions & reassignments

import { supabase } from '../../src/supabaseClient.js';
import {
  executeTransition,
  executeReassign,
  PATENT_ROLES
} from '../../src/patent/patentStateMachine.js';

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

    // 3. Dispatch action
    if (action === 'reassign') {
      const result = await executeReassign({
        filing,
        expectedVersion,
        newAssigneeId,
        newAuditorId,
        reason: reassignReason || note,
        actorId,
        actorRoles,
        dbClient: supabase
      });

      if (!result.success) {
        return res.status(result.status || 400).json({ error: result.error });
      }

      return res.status(200).json({
        success: true,
        message: 'Filing reassigned successfully.',
        filing: result.filing,
        event: result.event
      });
    }

    // Default: State Machine Transition
    const result = await executeTransition({
      filing,
      expectedVersion,
      toStatus,
      actorId,
      actorRoles,
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
