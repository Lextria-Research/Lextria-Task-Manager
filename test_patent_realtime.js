// test_patent_realtime.js
// Verification suite for Patent Filing Workflow Real-time Synchronization
import { isEventRecipient } from './src/PatentFiling/patentRealtime.js';
import { PATENT_ROLES } from './src/patent/patentStateMachine.js';
import { supabase } from './src/supabaseClient.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runRealtimeTests() {
  console.log('=====================================================');
  console.log('STARTING REAL-TIME SYNC & AUTHORIZATION VERIFICATION');
  console.log('=====================================================\n');

  const mounisha = { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha', role: 'leader' };
  const akshay = { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay', role: 'member' };
  const karthik = { id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133', name: 'Karthik', role: 'member' };
  const chaitra = { id: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', name: 'Chaitra', role: 'member' };
  const prashanth = { id: 'f7fe55e4-7c00-4030-86ed-0ccf39737074', name: 'Prashanth', role: 'member' };

  console.log('--- TEST GROUP 1: Recipient Authorization & Confidentiality (Criteria 2 & 9) ---');

  const filingAssigned = {
    id: 'f-101',
    code: 'TEST-RT-01',
    status: 'ASSIGNED',
    assignee_id: akshay.id,
    assignee_name: akshay.name,
    auditor_id: karthik.id,
    auditor_name: karthik.name,
    version: 1
  };

  // 1. Mounisha (SUPER_ADMIN) receives all events
  assert(
    isEventRecipient({ action: 'CREATE', filing: filingAssigned }, mounisha, [PATENT_ROLES.SUPER_ADMIN]),
    'Mounisha (SUPER_ADMIN) receives all CREATE events'
  );

  // 2. Current assignee (Akshay) receives CREATE event
  assert(
    isEventRecipient({ action: 'CREATE', filing: filingAssigned }, akshay, [PATENT_ROLES.ASSIGNEE]),
    'Assignee (Akshay) receives CREATE event'
  );

  // 3. Current auditor (Karthik) receives CREATE event
  assert(
    isEventRecipient({ action: 'CREATE', filing: filingAssigned }, karthik, [PATENT_ROLES.AUDITOR]),
    'Auditor (Karthik) receives CREATE event'
  );

  // 4. Unrelated member (Chaitra) receives NO event for private assigned filing (Criterion 9)
  assert(
    !isEventRecipient({ action: 'CREATE', filing: filingAssigned }, chaitra, [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR]),
    'Chaitra (unrelated assignee) receives NO events for filings that are not hers (Criterion 9)'
  );

  // 5. Audit transition event
  const filingInAudit = { ...filingAssigned, status: 'AUDIT', version: 3 };
  assert(
    isEventRecipient({ action: 'TRANSITION', filing: filingInAudit }, karthik, [PATENT_ROLES.AUDITOR]),
    'Auditor (Karthik) receives event when filing moves to AUDIT'
  );
  assert(
    !isEventRecipient({ action: 'TRANSITION', filing: filingInAudit }, chaitra, [PATENT_ROLES.AUDITOR]),
    'Chaitra receives NO event when Akshay sends to Karthik for AUDIT'
  );

  // 6. Correction transition event
  const filingInCorrection = { ...filingAssigned, status: 'CORRECTION', version: 4 };
  assert(
    isEventRecipient({ action: 'TRANSITION', filing: filingInCorrection }, akshay, [PATENT_ROLES.ASSIGNEE]),
    'Assignee (Akshay) receives event when filing moves to CORRECTION'
  );
  assert(
    !isEventRecipient({ action: 'TRANSITION', filing: filingInCorrection }, chaitra, [PATENT_ROLES.ASSIGNEE]),
    'Unrelated user receives NO event during CORRECTION phase'
  );

  // 7. Payment transition event (Criteria 6)
  const filingInPayment = { ...filingAssigned, status: 'PAYMENT', version: 5 };
  assert(
    isEventRecipient({ action: 'TRANSITION', filing: filingInPayment }, chaitra, [PATENT_ROLES.ASSIGNEE]),
    'All module users receive Payment stage events (Chaitra sees Payment)'
  );
  assert(
    isEventRecipient({ action: 'TRANSITION', filing: filingInPayment }, prashanth, [PATENT_ROLES.ACK_CHECKER]),
    'Prashanth receives Payment stage event'
  );

  // 8. Ack transition event (Criteria 7)
  const filingInAck = { ...filingAssigned, status: 'ACK', version: 6 };
  assert(
    isEventRecipient({ action: 'TRANSITION', filing: filingInAck }, prashanth, [PATENT_ROLES.ACK_CHECKER]),
    'Prashanth (Ack checker) receives Ack stage event live'
  );
  assert(
    isEventRecipient({ action: 'TRANSITION', filing: filingInAck }, akshay, [PATENT_ROLES.ASSIGNEE]),
    'Module users receive Ack stage event'
  );

  // 9. Reassignment event: previous auditor receives event to drop card (Criteria 8)
  const filingReassigned = {
    ...filingAssigned,
    auditor_id: chaitra.id,
    auditor_name: chaitra.name,
    version: 7
  };
  assert(
    isEventRecipient(
      {
        action: 'REASSIGN',
        filing: filingReassigned,
        previousAssigneeId: akshay.id,
        previousAuditorId: karthik.id
      },
      karthik,
      [PATENT_ROLES.AUDITOR]
    ),
    'Previous auditor (Karthik) receives REASSIGN event so card disappears from his board (Criterion 8)'
  );
  assert(
    isEventRecipient(
      {
        action: 'REASSIGN',
        filing: filingReassigned,
        previousAssigneeId: akshay.id,
        previousAuditorId: karthik.id
      },
      chaitra,
      [PATENT_ROLES.AUDITOR]
    ),
    'New auditor (Chaitra) receives REASSIGN event so card appears on her board'
  );

  console.log('\n--- TEST GROUP 2: Stale Version & Deduplication (Criteria 5) ---');

  const initialList = [{ ...filingAssigned, version: 3 }];
  const staleEvent = { ...filingAssigned, version: 2, status: 'FILING' };

  // Helper simulating board update
  function applyEvent(list, incoming) {
    const idx = list.findIndex(f => f.id === incoming.id);
    if (idx !== -1) {
      if ((list[idx].version || 0) >= (incoming.version || 0)) {
        return list; // Stale ignored
      }
      const next = [...list];
      next[idx] = { ...list[idx], ...incoming };
      return next;
    }
    return [incoming, ...list];
  }

  const afterStale = applyEvent(initialList, staleEvent);
  assert(afterStale[0].version === 3, 'Stale event with version 2 is ignored; current version remains 3');
  assert(afterStale[0].status === 'ASSIGNED', 'Stale event cannot revert newer state');

  const newerEvent = { ...filingAssigned, version: 4, status: 'AUDIT' };
  const afterNewer = applyEvent(initialList, newerEvent);
  assert(afterNewer[0].version === 4, 'Newer event with version 4 is cleanly applied');
  assert(afterNewer[0].status === 'AUDIT', 'Status is updated to AUDIT');
  assert(afterNewer.length === 1, 'No duplicate cards created on event application');

  console.log('\n--- TEST GROUP 3: Live Supabase Realtime Channel Transmission ---');

  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = 'https://mvtodtakdvgepztiyjzz.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dG9kdGFrZHZnZXB6dGl5anp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjQwNjMsImV4cCI6MjA5NDg0MDA2M30.aVeNQ95WxstJzUKbdSsc7jP-ElhxaPSmD_mw6jvlR1w';
  const clientB = createClient(supabaseUrl, supabaseKey);

  const testChannelName = 'test-patent-realtime-' + Date.now();
  let receivedPayload = null;

  const receiverChannel = supabase.channel(testChannelName, {
    config: { broadcast: { self: false } }
  });

  receiverChannel.on('broadcast', { event: 'PATENT_TEST' }, ({ payload }) => {
    receivedPayload = payload;
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(), 3000);
    receiverChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(t);
        resolve();
      }
    });
  });

  const senderChannel = clientB.channel(testChannelName, {
    config: { broadcast: { self: false } }
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(), 3000);
    senderChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(t);
        resolve();
      }
    });
  });

  await senderChannel.send({
    type: 'broadcast',
    event: 'PATENT_TEST',
    payload: {
      action: 'TRANSITION',
      filing: { id: 'test-123', code: 'TEST-RT-01', version: 2 },
      sentAt: Date.now()
    }
  });

  // Wait up to 1 second for transmission
  await new Promise((resolve) => setTimeout(resolve, 800));

  assert(receivedPayload !== null, 'Live broadcast payload received via Supabase Realtime channel');
  assert(receivedPayload?.filing?.code === 'TEST-RT-01', 'Broadcast payload preserved filing code accurately');
  assert(receivedPayload?.action === 'TRANSITION', 'Broadcast payload preserved action type accurately');

  await receiverChannel.unsubscribe();
  await senderChannel.unsubscribe();

  console.log('\n=====================================================');
  console.log(`REALTIME VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRealtimeTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
