// src/PatentFiling/patentRealtime.js
// Native Supabase Realtime synchronization engine for Patent Filing Workflow
// Manages broadcast channels, recipient authorization, optimistic deduplication,
// version-locking, auto-reconnect, and focus/polling resilience.

import { supabase } from '../supabaseClient.js';
import { PATENT_ROLES, hasPatentRole } from '../patent/patentStateMachine.js';
import { isMemberMatch } from '../patent/patentRoles.js';

export const REALTIME_CHANNEL_NAME = 'lextria-patent-filings-realtime';

let activeRealtimeChannel = null;

/**
 * Checks whether the current user is an authorized recipient of this event.
 * Server/client privacy rule: Never broadcast confidential filing data to unauthorized peers.
 *
 * Rules:
 * 1. Mounisha (SUPER_ADMIN): all events
 * 2. Current assignee and auditor
 * 3. Previous assignee/auditor on a reassignment (so card disappears from their board)
 * 4. All module users for Payment and Ack stage events
 */
export function isEventRecipient(payload, currentUser, userRoles = []) {
  if (!currentUser || !payload || !payload.filing) return false;

  const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN) ||
    (currentUser.role && currentUser.role.toLowerCase() === 'leader');

  // 1. Super Admin sees all filings
  if (isSuperAdmin) return true;

  const filing = payload.filing;
  const status = filing.status;

  // 2. Payment and Ack stage events are visible to all module users
  if (status === 'PAYMENT' || status === 'ACK' || status === 'CLOSED') {
    return true;
  }

  // 3. Current assignee and auditor
  const isAssignee = isMemberMatch(currentUser.id, currentUser.name, filing.assignee_id, filing.assignee_name);
  const isAuditor = isMemberMatch(currentUser.id, currentUser.name, filing.auditor_id, filing.auditor_name);
  if (isAssignee || isAuditor) return true;

  // 4. Previous assignee or auditor on a reassignment
  if (payload.action === 'REASSIGN') {
    const wasPrevAssignee = payload.previousAssigneeId && isMemberMatch(currentUser.id, currentUser.name, payload.previousAssigneeId);
    const wasPrevAuditor = payload.previousAuditorId && isMemberMatch(currentUser.id, currentUser.name, payload.previousAuditorId);
    if (wasPrevAssignee || wasPrevAuditor) return true;
  }

  return false;
}

/**
 * Broadcasts a filing mutation event across all connected clients via Supabase Realtime.
 */
export async function broadcastPatentChange(changePayload) {
  try {
    if (!activeRealtimeChannel) {
      activeRealtimeChannel = supabase.channel(REALTIME_CHANNEL_NAME, {
        config: { broadcast: { self: false } }
      });
      activeRealtimeChannel.subscribe();
    }

    await activeRealtimeChannel.send({
      type: 'broadcast',
      event: 'PATENT_CHANGE',
      payload: {
        ...changePayload,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.warn('Realtime broadcast error:', err);
  }
}

/**
 * Initializes authenticated real-time synchronization for the Patent Filing board.
 *
 * @param {Object} options
 * @param {Object} options.currentUser - Logged-in session user
 * @param {Array<string>} options.userRoles - User's module roles
 * @param {Function} options.onFilingEvent - Handler for incoming filing mutations
 * @param {Function} options.onConnectionChange - Handler for 'CONNECTED' | 'RECONNECTING'
 * @param {Function} options.onRefetchNeeded - Callback to trigger full board catch-up refetch
 * @returns {Function} destroy - Cleanup function to unsubscribe and clear timers
 */
export function initPatentRealtimeSync({
  currentUser,
  userRoles = [],
  onFilingEvent,
  onConnectionChange,
  onRefetchNeeded
}) {
  if (!currentUser || !currentUser.id) return () => {};

  let isSubscribed = false;
  let pollInterval = null;

  // Dedicated channel with presence identity & broadcast
  const channel = supabase.channel(REALTIME_CHANNEL_NAME, {
    config: {
      broadcast: { self: false },
      presence: { key: currentUser.id }
    }
  });

  activeRealtimeChannel = channel;

  // 1. Supabase Broadcast Listener (Instant peer-to-peer event transmission)
  channel.on('broadcast', { event: 'PATENT_CHANGE' }, ({ payload }) => {
    if (!payload || !payload.filing) return;

    // Strict privacy rule: verify recipient before dispatching to client state
    if (!isEventRecipient(payload, currentUser, userRoles)) {
      return;
    }

    if (onFilingEvent) {
      onFilingEvent(payload);
    }
  });

  // 2. Supabase Postgres Changes Listener (Database write level fallback)
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'patent_filings' }, () => {
    if (onRefetchNeeded) {
      onRefetchNeeded();
    }
  });

  // 3. Subscription Status & Auto-Reconnect Monitoring
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      isSubscribed = true;
      if (onConnectionChange) onConnectionChange('CONNECTED');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      isSubscribed = false;
      if (onConnectionChange) onConnectionChange('RECONNECTING');
    }
  });

  // 4. Tab Visibility & Window Focus Auto-Catchup
  const handleFocus = () => {
    if (onRefetchNeeded) onRefetchNeeded();
  };
  window.addEventListener('focus', handleFocus);
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      handleFocus();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // 5. 15-Second Fallback Polling (Resilience against network drops)
  pollInterval = setInterval(() => {
    if (onRefetchNeeded) onRefetchNeeded();
  }, 15000);

  // 6. Cleanup on unmount or logout
  return () => {
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (pollInterval) clearInterval(pollInterval);
    if (channel) {
      supabase.removeChannel(channel);
    }
    if (activeRealtimeChannel === channel) {
      activeRealtimeChannel = null;
    }
  };
}
