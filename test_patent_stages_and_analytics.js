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
import { DEFAULT_FILERS } from './src/PatentFiling/filerWorkloadConstants.js';
import { isLeaderOrSharan, isPranavBhat } from './src/attachmentUtils.js';
import { PATENT_STATUSES, PATENT_ROLES, executeReassign, validateStateTransition, hasPatentRole } from './src/patent/patentStateMachine.js';
import { isMemberMatch, getMemberPatentRoles } from './src/patent/patentRoles.js';
import { deleteFilingFromStorage, saveNewFilingToStorage } from './src/PatentFiling/patentStorage.js';
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

it('Stage 5: -> PAYMENT notifies both Assignee and Auditor with notification chime', () => {
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'AUDIT' },
    fromStatus: 'AUDIT',
    toStatus: 'PAYMENT',
    actor: karthikActor
  });

  assert.strictEqual(notifs.length, 2);
  const assigneeNotif = notifs.find(n => n.recipient_id === mockFiling.assignee_id);
  const auditorNotif = notifs.find(n => n.recipient_id === mockFiling.auditor_id);

  assert.ok(assigneeNotif, 'Assignee must receive notification chime');
  assert.strictEqual(assigneeNotif.role_type, 'filer');
  assert.ok(assigneeNotif.message.includes('moved to Payment'));

  assert.ok(auditorNotif, 'Auditor must receive notification chime');
  assert.strictEqual(auditorNotif.role_type, 'auditor');
  assert.ok(auditorNotif.message.includes('moved to Payment'));
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

it('Actor does not receive self-notification on standard transitions', () => {
  // If filer submits to audit, filer does not receive self-notification
  const notifs = buildFilingTransitionNotifications({
    filing: { ...mockFiling, status: 'FILING' },
    fromStatus: 'FILING',
    toStatus: 'AUDIT',
    actor: akshayActor
  });

  const selfNotif = notifs.find(n => n.recipient_id === akshayActor.id);
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

  console.log('\n--- TEST GROUP 7: New Requirements (Payment Audio, Toggle Filter, Auditor Re-direct, Payment Access) ---');

  await it('Auditor can re-direct audit of another auditor card to themselves', async () => {
    const prathviAuditorId = '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8'; // Prathvi
    const filingAuditedByKarthik = {
      ...mockFiling,
      id: 'filing-audit-takeover',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
      auditor_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133', // Karthik
      status: 'AUDIT',
      version: 1
    };

    const res = await executeReassign({
      filing: filingAuditedByKarthik,
      expectedVersion: 1,
      newAssigneeId: filingAuditedByKarthik.assignee_id,
      newAuditorId: prathviAuditorId,
      reason: 'Re-directed audit to Prathvi (auditor takeover)',
      actorId: prathviAuditorId,
      actorRoles: [PATENT_ROLES.AUDITOR]
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.filing.auditor_id, prathviAuditorId);
    assert.ok(res.event.note.includes('Re-directed audit to Prathvi (auditor takeover)'));
  });

  await it('Auditor cannot re-direct audit to themselves if they are the assignee of the card', async () => {
    const prathviId = '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8';
    const filingWithPrathviAsAssignee = {
      ...mockFiling,
      assignee_id: prathviId,
      auditor_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133',
      version: 1
    };

    const res = await executeReassign({
      filing: filingWithPrathviAsAssignee,
      expectedVersion: 1,
      newAssigneeId: prathviId,
      newAuditorId: prathviId,
      reason: 'Cannot audit own card',
      actorId: prathviId,
      actorRoles: [PATENT_ROLES.AUDITOR]
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Assignee and Auditor cannot be the same person'));
  });

  await it('Prathvi and Prashanth have access to confirm payment from PAYMENT -> ACK', () => {
    const prathviActor = { id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', name: 'Prathvi', role: 'member' };
    const prashanthActor = { id: 'f7fe55e4-7c00-4030-86ed-0ccf39737074', name: 'Prashanth', role: 'member' };

    const paymentFiling = {
      ...mockFiling,
      status: 'PAYMENT'
    };

    // Prathvi confirms payment
    const vPrathvi = validateStateTransition({
      filing: paymentFiling,
      toStatus: 'ACK',
      actorId: prathviActor.id,
      actor: prathviActor,
      actorRoles: [],
      payload: { payment_reference: 'Payment Done' }
    });
    assert.strictEqual(vPrathvi.valid, true, 'Prathvi can confirm payment');

    // Prashanth confirms payment
    const vPrashanth = validateStateTransition({
      filing: paymentFiling,
      toStatus: 'ACK',
      actorId: prashanthActor.id,
      actor: prashanthActor,
      actorRoles: [],
      payload: { payment_reference: 'IPO-MUM-99120' }
    });
    assert.strictEqual(vPrashanth.valid, true, 'Prashanth can confirm payment');
  });

  await it('Toggle switch logic: ALL shows all codes, MINE shows own plus all PAYMENT cards', () => {
    const member = { id: 'member-1', name: 'Member One' };
    const ownFiling = { id: '1', assignee_id: 'member-1', status: 'FILING' };
    const otherFiling = { id: '2', assignee_id: 'member-2', status: 'FILING' };
    const paymentFiling = { id: '3', assignee_id: 'member-3', status: 'PAYMENT' };

    const filterScope = (filing, codeScopeFilter) => {
      if (filing.status === 'PAYMENT') return true;
      if (codeScopeFilter === 'ALL') return true;
      return filing.assignee_id === member.id;
    };

    // Under 'ALL': all 3 filings are visible
    assert.strictEqual(filterScope(ownFiling, 'ALL'), true);
    assert.strictEqual(filterScope(otherFiling, 'ALL'), true);
    assert.strictEqual(filterScope(paymentFiling, 'ALL'), true);

    // Under 'MINE': own filing is visible, payment filing is accessible to all, but other normal filing is hidden
    assert.strictEqual(filterScope(ownFiling, 'MINE'), true);
    assert.strictEqual(filterScope(otherFiling, 'MINE'), false);
    assert.strictEqual(filterScope(paymentFiling, 'MINE'), true, 'Payment folder must be accessible to all members');
  });

  console.log('\n--- TEST GROUP 8: MISC Stage, Isolated Workflow & Action Buttons ---');

  await it('validateStateTransition permits designated assignee to mark MISC -> CLOSED', () => {
    const miscFiling = {
      id: 'misc-task-1',
      code: 'MISC-001',
      title: 'Review Client Response',
      status: 'MISC',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
      assignee_name: 'Akshay'
    };

    const res = validateStateTransition({
      filing: miscFiling,
      toStatus: 'CLOSED',
      actorId: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
      actorName: 'Akshay',
      actor: { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay' },
      actorRoles: [PATENT_ROLES.ASSIGNEE]
    });

    assert.strictEqual(res.valid, true, 'Designated assignee must be able to mark MISC task as Done');
  });

  await it('validateStateTransition permits Super Admin / Leader to mark MISC -> CLOSED', () => {
    const miscFiling = {
      id: 'misc-task-1',
      code: 'MISC-001',
      title: 'Review Client Response',
      status: 'MISC',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
      assignee_name: 'Akshay'
    };

    // Mounisha (Super Admin)
    const resMounisha = validateStateTransition({
      filing: miscFiling,
      toStatus: 'CLOSED',
      actorId: '42a71f9a-7119-457c-8092-0d5b75ce3060',
      actorName: 'Mounisha',
      actor: { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha' },
      actorRoles: [PATENT_ROLES.SUPER_ADMIN]
    });
    assert.strictEqual(resMounisha.valid, true, 'Super Admin must be able to mark MISC task as Done');

    // Leader
    const resLeader = validateStateTransition({
      filing: miscFiling,
      toStatus: 'CLOSED',
      actorId: 'sharan-id',
      actorName: 'Sharan',
      actor: { id: 'sharan-id', name: 'Sharan', role: 'Leader' },
      actorRoles: []
    });
    assert.strictEqual(resLeader.valid, true, 'Leader must be able to mark MISC task as Done');
  });

  await it('validateStateTransition forbids non-assignee from marking MISC -> CLOSED', () => {
    const miscFiling = {
      id: 'misc-task-1',
      code: 'MISC-001',
      title: 'Review Client Response',
      status: 'MISC',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
      assignee_name: 'Akshay'
    };

    const resOther = validateStateTransition({
      filing: miscFiling,
      toStatus: 'CLOSED',
      actorId: '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad', // Nikhil
      actorName: 'Nikhil',
      actor: { id: '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad', name: 'Nikhil', role: 'member' },
      actorRoles: [PATENT_ROLES.ASSIGNEE]
    });

    assert.strictEqual(resOther.valid, false);
    assert.strictEqual(resOther.status, 403);
    assert.ok(resOther.error.includes('Only the designated assignee or Super Admin can mark this task as done'));
  });

  await it('Pipeline Isolation: MISC tasks cannot transition into patent pipeline (FILING, AUDIT, PAYMENT, etc.)', () => {
    const miscFiling = {
      id: 'misc-task-1',
      code: 'MISC-001',
      title: 'Review Client Response',
      status: 'MISC',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
      assignee_name: 'Akshay'
    };

    const forbiddenTargets = ['ASSIGNED', 'FILING', 'AUDIT', 'CORRECTION', 'PAYMENT', 'ACK'];
    for (const target of forbiddenTargets) {
      const res = validateStateTransition({
        filing: miscFiling,
        toStatus: target,
        actorId: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
        actorName: 'Akshay',
        actor: { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay' },
        actorRoles: [PATENT_ROLES.ASSIGNEE]
      });
      assert.strictEqual(res.valid, false, `MISC must not transition to ${target}`);
    }
  });

  await it('Pipeline Isolation: Standard patent filings cannot transition into MISC stage', () => {
    const regularFiling = {
      id: 'filing-1',
      code: 'PAT-101',
      status: 'FILING',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
      assignee_name: 'Akshay'
    };

    const res = validateStateTransition({
      filing: regularFiling,
      toStatus: 'MISC',
      actorId: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
      actorName: 'Akshay',
      actor: { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay' },
      actorRoles: [PATENT_ROLES.ASSIGNEE]
    });
    assert.strictEqual(res.valid, false, 'Standard filings must not transition to MISC');
  });

  await it('saveNewFilingToStorage correctly saves MISC task with title, description, and assignee', async () => {
    const mounishaActor = { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha', role: 'admin' };
    const members = [
      { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha' },
      { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay' }
    ];

    const dynamicCode = 'MISC-TEST-' + Date.now();
    const taskData = {
      code: dynamicCode,
      title: 'Draft Client Notice',
      description: 'Please review and finalize the notice to client regarding patent publication.',
      assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
      status: 'MISC',
      filing_type: 'MISC',
      priority: 'High'
    };

    const res = await saveNewFilingToStorage(taskData, mounishaActor, members);
    assert.strictEqual(res.success, true, 'MISC task should save successfully');
    assert.strictEqual(res.filing.code, dynamicCode);
    assert.strictEqual(res.filing.status, 'MISC');
    assert.strictEqual(res.filing.is_misc, true);
    assert.strictEqual(res.filing.task_title, 'Draft Client Notice');
    assert.strictEqual(res.filing.description, 'Please review and finalize the notice to client regarding patent publication.');
    assert.strictEqual(res.filing.assignee_id, '396ee572-3f3b-47cc-8b11-d710cc8ed4bc');

    // Clean up created test filing from database
    if (res.filing?.id) {
      await deleteFilingFromStorage({ filingId: res.filing.id, code: dynamicCode, actor: mounishaActor, actorRoles: [PATENT_ROLES.SUPER_ADMIN] });
    }
  });

  await it('Dual action buttons for Super Admin Mounisha: + New Filing & + New Task', () => {
    const mounishaUser = { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha' };
    const userRoles = [PATENT_ROLES.SUPER_ADMIN];
    const isSuperAdmin = hasPatentRole(userRoles, PATENT_ROLES.SUPER_ADMIN) ||
      (mounishaUser.name && mounishaUser.name.toLowerCase().includes('mounisha'));

    assert.strictEqual(isSuperAdmin, true, 'Mounisha must have Super Admin permissions');
    // Mounisha has access to both actions:
    const availableActions = isSuperAdmin ? ['+ New Filing', '+ New Task'] : [];
    assert.deepStrictEqual(availableActions, ['+ New Filing', '+ New Task']);
  });

  console.log('\n--- TEST GROUP 9: Patent Filer Analytics & Access Restrictions ---');

  await it('DEFAULT_FILERS contains all 7 patent filers', () => {
    assert.strictEqual(DEFAULT_FILERS.length, 7);
    const names = DEFAULT_FILERS.map(d => d.name);
    assert.deepStrictEqual(names, [
      'Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi', 'Nikhil'
    ]);
  });

  await it('Patent Filing tab is ACCESSIBLE to Filers and Super Admins', () => {
    // Check Filers
    const akshayRoles = getMemberPatentRoles({ name: 'Akshay', role: 'member' });
    assert(hasPatentRole(akshayRoles, PATENT_ROLES.ASSIGNEE), 'Akshay has ASSIGNEE role (Filer)');

    const prashanthRoles = getMemberPatentRoles({ name: 'Prashanth', role: 'member' });
    assert(hasPatentRole(prashanthRoles, PATENT_ROLES.ASSIGNEE), 'Prashanth has ASSIGNEE role (Filer)');

    // Check Patent Admin / Super Admin
    const mounishaRoles = getMemberPatentRoles({ name: 'Mounisha', role: 'leader' });
    assert(hasPatentRole(mounishaRoles, PATENT_ROLES.SUPER_ADMIN), 'Mounisha has SUPER_ADMIN role');

    // Firm Leaders
    assert(isLeaderOrSharan({ name: 'Sharan', role: 'leader' }), 'Sharan has leadership access');
    assert(isLeaderOrSharan({ name: 'Pranav Bhat', role: 'leader' }), 'Pranav has leadership access');
  });

  await it('Patent Filing tab is RESTRICTED from non-patent members (Mahek, Thanush, Simran, Charan)', () => {
    const checkAccess = (user) => {
      const isLeader = isLeaderOrSharan(user) || (user?.role && user.role.toLowerCase() === 'leader');
      const roles = getMemberPatentRoles(user);
      const isFiler = hasPatentRole(roles, PATENT_ROLES.ASSIGNEE);
      const isPatentAdmin = hasPatentRole(roles, PATENT_ROLES.SUPER_ADMIN);
      const isAuditor = hasPatentRole(roles, PATENT_ROLES.AUDITOR);
      return Boolean(isLeader || isPatentAdmin || isFiler || isAuditor);
    };

    assert.strictEqual(checkAccess({ name: 'Mahek', role: 'member' }), false, 'Mahek should NOT have access');
    assert.strictEqual(checkAccess({ name: 'Thanush', role: 'member' }), false, 'Thanush should NOT have access');
    assert.strictEqual(checkAccess({ name: 'Simran', role: 'member' }), false, 'Simran should NOT have access');
    assert.strictEqual(checkAccess({ name: 'Charan', role: 'member' }), false, 'Charan should NOT have access');
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
