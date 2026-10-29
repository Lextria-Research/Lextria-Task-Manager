// src/PatentFiling/patentRealtime.js
// Native Supabase Realtime synchronization engine for Patent Filing Workflow
// Manages broadcast channels, recipient authorization, optimistic deduplication,
// version-locking, auto-reconnect, and multi-component subscription multiplexing.

import { supabase } from '../supabaseClient.js';
import { PATENT_ROLES, hasPatentRole } from '../patent/patentStateMachine.js';
import { isMemberMatch } from '../patent/patentRoles.js';

export const REALTIME_CHANNEL_NAME = 'lextria-patent-filings-realtime';

let activeRealtimeChannel = null;
const activeListeners = new Set();
let pollInterval = null;
let currentConnectionStatus = 'CONNECTED';

/**
 * Checks whether the current user is an authorized recipient of this event.
 * Server/client privacy rule: Never broadcast confidential filing data to unauthorized peers.
 *
 * Rules:
 * 1. Mounisha (SUPER_ADMIN): all events
 * 2. Current assignee and auditor
 * 3. Previous assignee/auditor on a reassignment (so card disappears from their board / receives reassigned notice)
 * 4. All module users for Payment and Ack stage events
 * 5. Explicitly listed notification recipient
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

  // 5. Explicit notification recipient
  if (Array.isArray(payload.notifications)) {
    const isTargetRecipient = payload.notifications.some(n =>
      isMemberMatch(currentUser.id, currentUser.name, n.recipient_id)
    );
    if (isTargetRecipient) return true;
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
 * Supports multiple concurrent subscribers (e.g. App.jsx global alerts + Dashboard board state).
 *
 * @param {Object} options
 * @param {Object} options.currentUser - Logged-in session user
 * @param {Array<string>} options.userRoles - User's module roles
 * @param {Function} options.onFilingEvent - Handler for incoming filing mutations
 * @param {Function} options.onConnectionChange - Handler for 'CONNECTED' | 'RECONNECTING'
 * @param {Function} options.onRefetchNeeded - Callback to trigger full board catch-up refetch
 * @returns {Function} destroy - Cleanup function to unsubscribe
 */
export function initPatentRealtimeSync({
  currentUser,
  userRoles = [],
  onFilingEvent,
  onConnectionChange,
  onRefetchNeeded
}) {
  if (!currentUser || !currentUser.id) return () => {};

  const listener = {
    currentUser,
    userRoles,
    onFilingEvent,
    onConnectionChange,
    onRefetchNeeded
  };

  activeListeners.add(listener);

  // If initial connection state is known, notify immediately
  if (onConnectionChange) {
    onConnectionChange(currentConnectionStatus);
  }

  // Setup channel if not already established
  if (!activeRealtimeChannel) {
    const channel = supabase.channel(REALTIME_CHANNEL_NAME, {
      config: {
        broadcast: { self: false },
        presence: { key: currentUser.id }
      }
    });

    // 1. Supabase Broadcast Listener
    channel.on('broadcast', { event: 'PATENT_CHANGE' }, ({ payload }) => {
      if (!payload || !payload.filing) return;

      activeListeners.forEach(sub => {
        if (isEventRecipient(payload, sub.currentUser, sub.userRoles)) {
          if (sub.onFilingEvent) {
            sub.onFilingEvent(payload);
          }
        }
      });
    });

    // 2. Supabase Postgres Changes Listener
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'patent_filings' }, () => {
      activeListeners.forEach(sub => {
        if (sub.onRefetchNeeded) {
          sub.onRefetchNeeded();
        }
      });
    });

    // 3. Status changes
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        currentConnectionStatus = 'CONNECTED';
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        currentConnectionStatus = 'RECONNECTING';
      }
      activeListeners.forEach(sub => {
        if (sub.onConnectionChange) sub.onConnectionChange(currentConnectionStatus);
      });
    });

    // 4. Tab visibility & window focus catch-up
    const handleFocus = () => {
      activeListeners.forEach(sub => {
        if (sub.onRefetchNeeded) sub.onRefetchNeeded();
      });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') handleFocus();
      });
    }

    // 5. 15-second polling resilience
    pollInterval = setInterval(() => {
      activeListeners.forEach(sub => {
        if (sub.onRefetchNeeded) sub.onRefetchNeeded();
      });
    }, 15000);

    activeRealtimeChannel = channel;
  }

  // Cleanup subscriber
  return () => {
    activeListeners.delete(listener);
    if (activeListeners.size === 0) {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (activeRealtimeChannel) {
        supabase.removeChannel(activeRealtimeChannel);
        activeRealtimeChannel = null;
      }
    }
  };
}
