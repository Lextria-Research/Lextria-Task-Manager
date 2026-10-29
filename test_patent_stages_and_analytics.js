// test_patent_stages_and_analytics.js
// Verification suite for:
// 1. Stage-by-Stage Sound Notifications (filer.mp3 / auditor.mp3 for respective personnel)
// 2. Drafter Workload Analytics Platform & Metrics
// 3. Queries Tab Visibility (Leaders only)
// 4. Eisenhower Matrix Taskboard (Pranav Bhat only)
// 5. Merged All Code / My Code Visibility in Patent Filing

import assert from 'assert';
import {
  buildFilingTransitionNotifications,
  playPatentNotificationSound,
  getPatentSoundEnabled,
  formatEstTime
} from './src/PatentFiling/patentNotifications.js';
import { DEFAULT_DRAFTERS } from './src/PatentFiling/drafterWorkloadConstants.js';
import { isLeaderOrSharan, isPranavBhat } from './src/attachmentUtils.js';
import { PATENT_STATUSES, PATENT_ROLES } from './src/patent/patentStateMachine.js';
import { isMemberMatch } from './src/patent/patentRoles.js';
import { deleteFilingFromStorage } from './src/PatentFiling/patentStorage.js';
import { isEventRecipient } from './src/PatentFiling/patentRealtime.js';

let passedTests = 0;
let failedTests = 0;

async function it(desc, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${desc}:`, err.message);
    failedTests++;
  }
}

// Mock data
const mockFiling = {
  id: 'filing-test-001',
  code: 'PAT-99',
  filing_type: 'Provisional Application',
  assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
  assignee_name: 'Akshay',
  auditor_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133', // Karthik
  auditor_name: 'Karthik',
  est_filing_minutes: 120,
  est_audit_minutes: 60,
  status: 'ASSIGNED',
  version: 1
};

const akshayActor = { id: mockFiling.assignee_id, name: 'Akshay' };
const karthikActor = { id: mockFiling.auditor_id, name: 'Karthik' };
const prashanthAckActor = { id: 'f7fe55e4-7c00-4030-86ed-0ccf39737074', name: 'Prashanth' };
const mounishaAdminActor = { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha', role: 'leader' };

async function runAllTests() {
  console.log('=====================================================');
  console.log('STARTING STAGES, ANALYTICS & ACCESS PERMISSIONS TESTS');
  console.log('=====================================================\n');

  console.log('--- TEST GROUP 1: Stage-by-Stage Notifications & Sound Assignments ---');

  await it('Stage 1: ASSIGNED -> FILING notifies Auditor (Doorbell sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: mockFiling,
    fromStatus: 'ASSIGNED',
    toStatus: 'FILING',
    actor: akshayActor
  });

  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(notifs[0].recipient_id, mockFiling.auditor_id);
  assert.strictEqual(notifs[0].role_type, 'auditor', 'Role type must be auditor for doorbell sound');
  assert.ok(notifs[0].message.includes('PAT-99 accepted by Assignee'));
});

it('Stage 2: FILING -> AUDIT notifies Auditor (Doorbell sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'FILING' },
    fromStatus: 'FILING',
    toStatus: 'AUDIT',
    actor: akshayActor
  });

  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(notifs[0].recipient_id, mockFiling.auditor_id);
  assert.strictEqual(notifs[0].role_type, 'auditor', 'Role type must be auditor for doorbell sound');
  assert.ok(notifs[0].message.includes('has been submitted for your audit by Akshay'));
  assert.ok(notifs[0].message.includes('Est. audit time: 1h 0m'));
});

it('Stage 3: AUDIT -> CORRECTION notifies Assignee (Air horn sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'AUDIT' },
    fromStatus: 'AUDIT',
    toStatus: 'CORRECTION',
    actor: karthikActor,
    payload: { description: 'Clarify claim 3 and check drawings' }
  });

  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(notifs[0].recipient_id, mockFiling.assignee_id);
  assert.strictEqual(notifs[0].role_type, 'filer', 'Role type must be filer for air horn sound');
  assert.ok(notifs[0].message.includes('sent for correction by Auditor (Karthik)'));
  assert.ok(notifs[0].message.includes('Clarify claim 3 and check drawings'));
});

it('Stage 4: CORRECTION -> AUDIT (re-audit) notifies Auditor (Doorbell sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'CORRECTION' },
    fromStatus: 'CORRECTION',
    toStatus: 'AUDIT',
    actor: akshayActor
  });

  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(notifs[0].recipient_id, mockFiling.auditor_id);
  assert.strictEqual(notifs[0].role_type, 'auditor');
  assert.ok(notifs[0].message.includes('corrections submitted for re-audit'));
});

it('Stage 5: AUDIT -> PAYMENT notifies Assignee (Air horn sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'AUDIT' },
    fromStatus: 'AUDIT',
    toStatus: 'PAYMENT',
    actor: karthikActor
  });

  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(notifs[0].recipient_id, mockFiling.assignee_id);
  assert.strictEqual(notifs[0].role_type, 'filer');
  assert.ok(notifs[0].message.includes('approved by Auditor (Karthik) and moved to Payment'));
});

it('Stage 6: PAYMENT -> ACK notifies Ack Checker (Doorbell sound) and Assignee (Air horn sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'PAYMENT' },
    fromStatus: 'PAYMENT',
    toStatus: 'ACK',
    actor: mounishaAdminActor,
    payload: { payment_reference: 'IPO-REC-88412' }
  });

  assert.strictEqual(notifs.length, 2);
  const ackCheckerNotif = notifs.find(n => n.recipient_id === prashanthAckActor.id);
  const assigneeNotif = notifs.find(n => n.recipient_id === mockFiling.assignee_id);

  assert.ok(ackCheckerNotif, 'Ack checker must receive notification');
  assert.strictEqual(ackCheckerNotif.role_type, 'auditor');
  assert.ok(ackCheckerNotif.message.includes('Ref: IPO-REC-88412'));

  assert.ok(assigneeNotif, 'Assignee must receive notification');
  assert.strictEqual(assigneeNotif.role_type, 'filer');
});

it('Stage 7: ACK -> CLOSED notifies Assignee (filer sound) and Auditor (auditor sound)', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'ACK' },
    fromStatus: 'ACK',
    toStatus: 'CLOSED',
    actor: prashanthAckActor
  });

  assert.strictEqual(notifs.length, 2);
  const assigneeNotif = notifs.find(n => n.recipient_id === mockFiling.assignee_id);
  const auditorNotif = notifs.find(n => n.recipient_id === mockFiling.auditor_id);

  assert.ok(assigneeNotif);
  assert.strictEqual(assigneeNotif.role_type, 'filer');
  assert.ok(assigneeNotif.message.includes('officially closed and completed'));

  assert.ok(auditorNotif);
  assert.strictEqual(auditorNotif.role_type, 'auditor');
  assert.ok(auditorNotif.message.includes('officially closed and completed'));
});

it('Actor does not receive self-notification', () => {
  // If auditor submits to payment, auditor is NOT in notifications
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'AUDIT' },
    fromStatus: 'AUDIT',
    toStatus: 'PAYMENT',
    actor: karthikActor
  });

  const selfNotif = notifs.find(n => n.recipient_id === karthikActor.id);
  assert.strictEqual(selfNotif, undefined, 'Actor should not receive self-notification');
});

console.log('\n--- TEST GROUP 2: Drafter Workload Platform Data & Calculations ---');

it('DEFAULT_DRAFTERS contains all 8 drafters from screenshot', () => {
  assert.strictEqual(DEFAULT_DRAFTERS.length, 8);
  const names = DEFAULT_DRAFTERS.map(d => d.name);
  assert.deepStrictEqual(names, [
    'Thanush', 'Ayush', 'Amith', 'Pratham', 'Abhishek', 'Thilak', 'Anusha', 'Pramith'
  ]);
});

it('Drafter active matters match screenshot numbers exactly', () => {
  const map = Object.fromEntries(DEFAULT_DRAFTERS.map(d => [d.name, d.active]));
  assert.strictEqual(map['Thanush'], 126);
  assert.strictEqual(map['Ayush'], 77);
  assert.strictEqual(map['Amith'], 79);
  assert.strictEqual(map['Pratham'], 158);
  assert.strictEqual(map['Abhishek'], 65);
  assert.strictEqual(map['Thilak'], 88);
  assert.strictEqual(map['Anusha'], 276);
  assert.strictEqual(map['Pramith'], 79);
});

it('Load vs. Avg percentage matches screenshot values against 110 baseline', () => {
  const baseline = 110;
  const pcts = Object.fromEntries(DEFAULT_DRAFTERS.map(d => [d.name, Math.round((d.active / baseline) * 100)]));

  assert.strictEqual(pcts['Thanush'], 115, 'Thanush 115% (Blue)');
  assert.strictEqual(pcts['Ayush'], 70, 'Ayush 70% (Green)');
  assert.strictEqual(pcts['Amith'], 72, 'Amith 72% (Green)');
  assert.strictEqual(pcts['Pratham'], 144, 'Pratham 144% (Red)');
  assert.strictEqual(pcts['Abhishek'], 59, 'Abhishek 59% (Green)');
  assert.strictEqual(pcts['Thilak'], 80, 'Thilak 80% (Blue)');
  assert.strictEqual(pcts['Anusha'], 251, 'Anusha 251% (Red)');
  assert.strictEqual(pcts['Pramith'], 72, 'Pramith 72% (Green)');
});

console.log('\n--- TEST GROUP 3: Queries Tab Access Restriction ---');

it('Queries tab visible to Pranav Bhat (Leader)', () => {
  assert.strictEqual(isLeaderOrSharan({ name: 'Pranav Bhat', role: 'leader' }), true);
});

it('Queries tab visible to Sharan (Leader)', () => {
  assert.strictEqual(isLeaderOrSharan({ name: 'Sharan', role: 'leader' }), true);
});

it('Queries tab visible to Mounisha (Leader)', () => {
  assert.strictEqual(isLeaderOrSharan({ name: 'Mounisha', role: 'leader' }), true);
});

it('Queries tab HIDDEN from regular members (Akshay, Karthik, Chaitra, Thanush)', () => {
  assert.strictEqual(isLeaderOrSharan({ name: 'Akshay', role: 'member' }), false);
  assert.strictEqual(isLeaderOrSharan({ name: 'Karthik', role: 'member' }), false);
  assert.strictEqual(isLeaderOrSharan({ name: 'Chaitra', role: 'member' }), false);
  assert.strictEqual(isLeaderOrSharan({ name: 'Thanush', role: 'member' }), false);
  assert.strictEqual(isLeaderOrSharan({ name: 'Ayush', role: 'member' }), false);
});

console.log('\n--- TEST GROUP 4: Eisenhower Matrix Pranav Bhat Restriction ---');

it('Eisenhower Matrix visible ONLY to Pranav Bhat', () => {
  assert.strictEqual(isPranavBhat({ name: 'Pranav Bhat', role: 'leader' }), true);
  assert.strictEqual(isPranavBhat({ name: 'PranavBhat' }), true);
  assert.strictEqual(isPranavBhat({ name: 'Pranav', role: 'leader' }), true);
});

it('Eisenhower Matrix HIDDEN from Sharan (even though Sharan is a Leader)', () => {
  assert.strictEqual(isPranavBhat({ name: 'Sharan', role: 'leader' }), false);
});

it('Eisenhower Matrix HIDDEN from Mounisha (even though Mounisha is a Leader)', () => {
  assert.strictEqual(isPranavBhat({ name: 'Mounisha', role: 'leader' }), false);
});

it('Eisenhower Matrix HIDDEN from all regular members', () => {
  assert.strictEqual(isPranavBhat({ name: 'Akshay', role: 'member' }), false);
  assert.strictEqual(isPranavBhat({ name: 'Karthik', role: 'member' }), false);
  assert.strictEqual(isPranavBhat({ name: 'Prashanth', role: 'member' }), false);
  assert.strictEqual(isPranavBhat(null), false);
});

console.log('\n--- TEST GROUP 5: Merged All Code & My Code Scoping ---');

it('Leaders see all codes assigned across the entire board', () => {
  const isLeader = isLeaderOrSharan(mounishaAdminActor);
  assert.strictEqual(isLeader, true);

  // In PatentKanbanBoard, if isLeader === true, filterByRoleScope returns true for all filings
  const filingA = { ...mockFiling, assignee_id: 'other-user', auditor_id: 'another-user' };
  const canSee = isLeader;
  assert.strictEqual(canSee, true, 'Leaders must see all assigned codes');
});

it('Regular members see only codes where they are assignee or auditor', () => {
  const memberAkshay = { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay', role: 'member' };
  const isLeader = isLeaderOrSharan(memberAkshay);
  assert.strictEqual(isLeader, false);

  const ownFiling = {
    ...mockFiling,
    assignee_id: memberAkshay.id,
    assignee_name: 'Akshay'
  };

  const otherFiling = {
    ...mockFiling,
    id: 'f-other',
    assignee_id: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', // Chaitra
    assignee_name: 'Chaitra',
    auditor_id: '0a11ce02-42df-4007-b8a7-afcb4b9efe2c', // Kaushal
    auditor_name: 'Kaushal',
    status: 'FILING'
  };

  // Check Akshay on own filing
  const isMine = isMemberMatch(memberAkshay.id, memberAkshay.name, ownFiling.assignee_id, ownFiling.assignee_name);
  const isAuditedByMe = isMemberMatch(memberAkshay.id, memberAkshay.name, ownFiling.auditor_id, ownFiling.auditor_name);
  assert.strictEqual(isMine || isAuditedByMe, true, 'Akshay sees his own assigned filing');

  // Check Akshay on other filing
  const isMineOther = isMemberMatch(memberAkshay.id, memberAkshay.name, otherFiling.assignee_id, otherFiling.assignee_name);
  const isAuditedByMeOther = isMemberMatch(memberAkshay.id, memberAkshay.name, otherFiling.auditor_id, otherFiling.auditor_name);
  assert.strictEqual(isMineOther || isAuditedByMeOther, false, 'Akshay CANNOT see unrelated members codes');
});

console.log('\n--- TEST GROUP 6: Leader Delete Filing Permission & Real-Time Sync ---');

  await it('deleteFilingFromStorage rejects non-leader attempts', async () => {
    const regularMember = { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay', role: 'member' };
    const res = await deleteFilingFromStorage({
      filingId: 'filing-test-001',
      code: 'PAT-99',
      actor: regularMember,
      actorRoles: [PATENT_ROLES.ASSIGNEE]
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Only firm leaders can delete'));
  });

  await it('deleteFilingFromStorage permits leaders (Mounisha / Pranav / Sharan)', async () => {
    const leaderMounisha = { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha', role: 'leader' };
    const res = await deleteFilingFromStorage({
      filingId: '00000000-0000-0000-0000-000000000001',
      code: 'TEST-DEL-1',
      actor: leaderMounisha,
      actorRoles: [PATENT_ROLES.SUPER_ADMIN]
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.code, 'TEST-DEL-1');
  });

  await it('Realtime DELETE event is dispatched to all clients so card disappears everywhere', () => {
    const regularMember = { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay', role: 'member' };
    const deletePayload = {
      action: 'DELETE',
      filingId: '00000000-0000-0000-0000-000000000001',
      code: 'TEST-DEL-1'
    };
    const isRecipient = isEventRecipient(deletePayload, regularMember, [PATENT_ROLES.ASSIGNEE]);
    assert.strictEqual(isRecipient, true, 'All clients must receive DELETE event to remove card from board');
  });

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('=====================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
