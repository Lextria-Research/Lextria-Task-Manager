// test_patent_workflow.js
// Automated verification test suite for Patent Filing Workflow (Phase 1)
// Tests: Data model validation, State Machine matrix, Optimistic locking,
// Server-side authorization guards, Role management, and Audit trails.

import {
  PATENT_ROLES,
  PATENT_STATUSES,
  hasPatentRole,
  validateStateTransition,
  validateFilingCreation,
  executeTransition,
  executeReassign
} from './src/patent/patentStateMachine.js';
import { SEED_ROLE_ASSIGNMENTS } from './scripts/seed_patent_roles.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, detail = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail}`);
  }
}

console.log('=====================================================');
console.log('STARTING PHASE 1 VERIFICATION: PATENT FILING WORKFLOW');
console.log('=====================================================\n');

// ----------------------------------------------------
// Test Group 1: Seed Data & Role Verification
// ----------------------------------------------------
console.log('--- TEST GROUP 1: Seed Role Assignments ---');

assert(SEED_ROLE_ASSIGNMENTS.SUPER_ADMIN.includes('Mounisha'), 'Mounisha has SUPER_ADMIN role');
assert(SEED_ROLE_ASSIGNMENTS.ACK_CHECKER.includes('Prashanth'), 'Prashanth has ACK_CHECKER role');

const expectedAssignees = ['Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi'];
expectedAssignees.forEach(name => {
  assert(SEED_ROLE_ASSIGNMENTS.ASSIGNEE.includes(name), `${name} has ASSIGNEE role`);
});

const expectedAuditors = ['Prathvi', 'Chaitra', 'Kaushal', 'Karthik'];
expectedAuditors.forEach(name => {
  assert(SEED_ROLE_ASSIGNMENTS.AUDITOR.includes(name), `${name} has AUDITOR role`);
});

assert(hasPatentRole([PATENT_ROLES.SUPER_ADMIN], PATENT_ROLES.SUPER_ADMIN) === true, 'hasPatentRole detects SUPER_ADMIN');
assert(hasPatentRole([PATENT_ROLES.ASSIGNEE], PATENT_ROLES.AUDITOR) === false, 'hasPatentRole returns false for missing role');
assert(hasPatentRole([], PATENT_ROLES.ASSIGNEE) === false, 'hasPatentRole handles empty array');
assert(hasPatentRole(null, PATENT_ROLES.ASSIGNEE) === false, 'hasPatentRole handles null array');

// ----------------------------------------------------
// Test Group 2: Assignee != Auditor Validation (Criteria 2)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 2: Validation of Assignee != Auditor (Criteria 2) ---');

// Same person on create
const samePersonCreate = validateFilingCreation({
  code: 'PAT-001',
  filing_type: 'Provisional',
  assignee_id: 'user_karthik',
  auditor_id: 'user_karthik',
  actorRoles: [PATENT_ROLES.SUPER_ADMIN]
});
assert(samePersonCreate.valid === false, 'Filing creation with same assignee and auditor is rejected');
assert(samePersonCreate.status === 400, 'Rejection returns HTTP 400 status');
assert(samePersonCreate.error.includes('Assignee and Auditor cannot be the same person'), 'Helpful error message returned');

// Distinct people on create
const distinctPersonCreate = validateFilingCreation({
  code: 'PAT-001',
  filing_type: 'Provisional',
  assignee_id: 'user_karthik',
  auditor_id: 'user_prathvi',
  actorRoles: [PATENT_ROLES.SUPER_ADMIN]
});
assert(distinctPersonCreate.valid === true, 'Filing creation with distinct assignee and auditor is accepted');

// Non-super admin cannot create
const memberCreate = validateFilingCreation({
  code: 'PAT-002',
  filing_type: 'Provisional',
  assignee_id: 'user_karthik',
  auditor_id: 'user_prathvi',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(memberCreate.valid === false, 'Non-super admin cannot create filings');
assert(memberCreate.status === 403, 'Non-super admin creation returns HTTP 403');

// ----------------------------------------------------
// Test Group 3: Server-side Authorization & State Machine (Criteria 1)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 3: State Machine Guard Checks (Criteria 1) ---');

const mockFilingAssigned = {
  id: 'filing-101',
  code: 'PAT-101',
  status: PATENT_STATUSES.ASSIGNED,
  assignee_id: 'user_karthik',
  auditor_id: 'user_prathvi',
  version: 1,
  correction_count: 0
};

// Akshay tries to accept Karthik's assigned code -> MUST BE REJECTED
const akshayAttempt = validateStateTransition({
  filing: mockFilingAssigned,
  toStatus: PATENT_STATUSES.FILING,
  actorId: 'user_akshay',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(akshayAttempt.valid === false, 'Akshay cannot accept a code assigned to Karthik (Criteria 1)');
assert(akshayAttempt.status === 403, 'Akshay attempt returns HTTP 403 Forbidden');

// Karthik (the actual assignee) accepts -> MUST BE ACCEPTED
const karthikAccept = validateStateTransition({
  filing: mockFilingAssigned,
  toStatus: PATENT_STATUSES.FILING,
  actorId: 'user_karthik',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(karthikAccept.valid === true, 'Karthik (actual assignee) can accept assigned filing');

// Akshay tries to send Karthik's code to audit -> MUST BE REJECTED
const mockFilingInFiling = { ...mockFilingAssigned, status: PATENT_STATUSES.FILING };
const akshayAuditAttempt = validateStateTransition({
  filing: mockFilingInFiling,
  toStatus: PATENT_STATUSES.AUDIT,
  actorId: 'user_akshay',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(akshayAuditAttempt.valid === false, 'Akshay cannot submit Karthik code to audit');
assert(akshayAuditAttempt.status === 403, 'Akshay audit attempt returns HTTP 403 Forbidden');

// Karthik submits to audit -> MUST BE ACCEPTED
const karthikAudit = validateStateTransition({
  filing: mockFilingInFiling,
  toStatus: PATENT_STATUSES.AUDIT,
  actorId: 'user_karthik',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(karthikAudit.valid === true, 'Karthik can submit his filed code to audit');

// ----------------------------------------------------
// Test Group 4: Correction Flow Constraints (Criteria 3 & 4)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 4: Correction Flow & Description Requirement (Criteria 3 & 4) ---');

const mockFilingInAudit = { ...mockFilingAssigned, status: PATENT_STATUSES.AUDIT };

// Auditor sends for correction WITHOUT description -> MUST BE REJECTED
const missingDescCorrection = validateStateTransition({
  filing: mockFilingInAudit,
  toStatus: PATENT_STATUSES.CORRECTION,
  actorId: 'user_prathvi', // Auditor
  actorRoles: [PATENT_ROLES.AUDITOR],
  payload: { description: '' }
});
assert(missingDescCorrection.valid === false, 'Auditor cannot send to correction without description (Criteria 3)');
assert(missingDescCorrection.status === 400, 'Missing description returns HTTP 400');

// Non-auditor tries to send for correction -> MUST BE REJECTED
const nonAuditorCorrection = validateStateTransition({
  filing: mockFilingInAudit,
  toStatus: PATENT_STATUSES.CORRECTION,
  actorId: 'user_karthik', // Assignee, not auditor
  actorRoles: [PATENT_ROLES.AUDITOR],
  payload: { description: 'Needs figures' }
});
assert(nonAuditorCorrection.valid === false, 'Non-auditor cannot send filing for correction');
assert(nonAuditorCorrection.status === 403, 'Non-auditor returns HTTP 403');

// Auditor sends with description -> MUST BE ACCEPTED
const validCorrection = validateStateTransition({
  filing: mockFilingInAudit,
  toStatus: PATENT_STATUSES.CORRECTION,
  actorId: 'user_prathvi',
  actorRoles: [PATENT_ROLES.AUDITOR],
  payload: { description: 'Missing claim 4 dependencies and figure 3 resolution.' }
});
assert(validCorrection.valid === true, 'Auditor can send for correction when description is provided');

// Simulate executeTransition to CORRECTION
const correctionExecution = await executeTransition({
  filing: mockFilingInAudit,
  expectedVersion: 1,
  toStatus: PATENT_STATUSES.CORRECTION,
  actorId: 'user_prathvi',
  actorRoles: [PATENT_ROLES.AUDITOR],
  payload: {
    description: 'Missing claim 4 dependencies',
    attachments: [{ name: 'spec_error.png', url: 'private://attachment1' }]
  }
});
assert(correctionExecution.success === true, 'executeTransition to CORRECTION succeeds');
assert(correctionExecution.filing.correction_count === 1, 'correction_count incremented to 1');
assert(correctionExecution.newCorrectionRound.round_no === 1, 'Correction round 1 created');
assert(correctionExecution.newCorrectionRound.description === 'Missing claim 4 dependencies', 'Correction round preserves description');
assert(correctionExecution.newCorrectionRound.attachments.length === 1, 'Correction round preserves attachments');

// Assignee corrects and returns to AUDIT
const correctedExecution = await executeTransition({
  filing: correctionExecution.filing,
  expectedVersion: 2,
  toStatus: PATENT_STATUSES.AUDIT,
  actorId: 'user_karthik', // Assignee
  actorRoles: [PATENT_ROLES.ASSIGNEE],
  payload: {
    assignee_response: 'Updated claim 4 and enhanced figure 3 DPI.'
  }
});
assert(correctedExecution.success === true, 'Assignee can transition from CORRECTION to AUDIT');
assert(correctedExecution.updateCorrectionRound.resolved_by === 'user_karthik', 'Round resolved_by recorded');
assert(correctedExecution.updateCorrectionRound.assignee_response.includes('Updated claim 4'), 'Assignee response preserved');

// ----------------------------------------------------
// Test Group 5: Payment & Ack Requirements (Criteria 5 & 6)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 5: Payment & Ack Confirmation (Criteria 5 & 6) ---');

const mockFilingPayment = { ...mockFilingAssigned, status: PATENT_STATUSES.PAYMENT, version: 3 };

// Confirm payment without reference -> MUST BE REJECTED
const missingRefPayment = validateStateTransition({
  filing: mockFilingPayment,
  toStatus: PATENT_STATUSES.ACK,
  actorId: 'user_shilpa',
  actorRoles: [PATENT_ROLES.ASSIGNEE],
  payload: { payment_reference: '' }
});
assert(missingRefPayment.valid === false, 'Payment cannot be confirmed without payment reference (Criteria 5)');
assert(missingRefPayment.status === 400, 'Missing payment reference returns HTTP 400');

// Confirm payment with reference
const validPaymentExec = await executeTransition({
  filing: mockFilingPayment,
  expectedVersion: 3,
  toStatus: PATENT_STATUSES.ACK,
  actorId: 'user_shilpa',
  actorRoles: [PATENT_ROLES.ASSIGNEE],
  payload: { payment_reference: 'IPO-CH-2026-99881' }
});
assert(validPaymentExec.success === true, 'Payment confirmed successfully with reference');
assert(validPaymentExec.filing.payment_reference === 'IPO-CH-2026-99881', 'Payment reference stored');
assert(validPaymentExec.filing.payment_confirmed_by === 'user_shilpa', 'Confirming user stored (Criteria 5)');
assert(Boolean(validPaymentExec.filing.payment_confirmed_at), 'Payment confirmation timestamp stored (Criteria 5)');

// Close filing: User without ACK_CHECKER role -> MUST BE REJECTED (Criteria 6)
const mockFilingAck = validPaymentExec.filing;
const nonAckClose = validateStateTransition({
  filing: mockFilingAck,
  toStatus: PATENT_STATUSES.CLOSED,
  actorId: 'user_karthik',
  actorRoles: [PATENT_ROLES.ASSIGNEE, PATENT_ROLES.AUDITOR] // Karthik does NOT have ACK_CHECKER
});
assert(nonAckClose.valid === false, 'User without ACK_CHECKER cannot close filing (Criteria 6)');
assert(nonAckClose.status === 403, 'Non ACK_CHECKER closure returns HTTP 403 Forbidden');

// Close filing: Prashanth (ACK_CHECKER) -> MUST BE ACCEPTED (Criteria 6)
const ackCloseExec = await executeTransition({
  filing: mockFilingAck,
  expectedVersion: mockFilingAck.version,
  toStatus: PATENT_STATUSES.CLOSED,
  actorId: 'user_prashanth',
  actorRoles: [PATENT_ROLES.ACK_CHECKER]
});
assert(ackCloseExec.success === true, 'User with ACK_CHECKER can close filing (Criteria 6)');
assert(ackCloseExec.filing.status === PATENT_STATUSES.CLOSED, 'Status transitioned to CLOSED');
assert(ackCloseExec.filing.ack_confirmed_by === 'user_prashanth', 'ack_confirmed_by logged');
assert(Boolean(ackCloseExec.filing.ack_confirmed_at), 'ack_confirmed_at logged');

// ----------------------------------------------------
// Test Group 6: Super Admin Force Move & Reassignment (Criteria 7)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 7: Super Admin Reassignment & Force Move (Criteria 7) ---');

const activeFiling = {
  id: 'filing-500',
  code: 'PAT-500',
  status: PATENT_STATUSES.FILING,
  assignee_id: 'user_akshay',
  auditor_id: 'user_chaitra',
  version: 2
};

// Reassign mid-flow by non-super admin -> MUST BE REJECTED
const memberReassign = await executeReassign({
  filing: activeFiling,
  expectedVersion: 2,
  newAssigneeId: 'user_kaushal',
  reason: 'Workload balancing',
  actorId: 'user_akshay',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(memberReassign.success === false, 'Non-super admin cannot reassign filing');
assert(memberReassign.status === 403, 'Non-super admin reassign returns HTTP 403');

// Reassign mid-flow by SUPER_ADMIN without reason -> MUST BE REJECTED
const noReasonReassign = await executeReassign({
  filing: activeFiling,
  expectedVersion: 2,
  newAssigneeId: 'user_kaushal',
  reason: '',
  actorId: 'user_mounisha',
  actorRoles: [PATENT_ROLES.SUPER_ADMIN]
});
assert(noReasonReassign.success === false, 'Reassignment without reason is rejected');
assert(noReasonReassign.status === 400, 'Reassignment without reason returns HTTP 400');

// Reassign mid-flow setting assignee == auditor -> MUST BE REJECTED
const conflictReassign = await executeReassign({
  filing: activeFiling,
  expectedVersion: 2,
  newAssigneeId: 'user_chaitra', // Chaitra is already auditor!
  reason: 'Takeover',
  actorId: 'user_mounisha',
  actorRoles: [PATENT_ROLES.SUPER_ADMIN]
});
assert(conflictReassign.success === false, 'Reassignment with same assignee and auditor is rejected (Criteria 2)');
assert(conflictReassign.status === 400, 'Reassignment conflict returns HTTP 400');

// Valid Reassignment by SUPER_ADMIN with reason (Criteria 7)
const validReassign = await executeReassign({
  filing: activeFiling,
  expectedVersion: 2,
  newAssigneeId: 'user_kaushal',
  reason: 'Akshay on leave; reassigning to Kaushal',
  actorId: 'user_mounisha',
  actorRoles: [PATENT_ROLES.SUPER_ADMIN]
});
assert(validReassign.success === true, 'SUPER_ADMIN can reassign mid-flow (Criteria 7)');
assert(validReassign.filing.assignee_id === 'user_kaushal', 'New assignee updated');
assert(validReassign.event.note.includes('Akshay on leave'), 'Reason logged in event audit trail (Criteria 7)');
assert(validReassign.filing.version === 3, 'Version incremented after reassignment');

// ----------------------------------------------------
// Test Group 7: Optimistic Concurrency Locking (Criteria 8)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 8: Optimistic Concurrency Locking (Criteria 8) ---');

const cardV1 = {
  id: 'card-1',
  code: 'PAT-999',
  status: PATENT_STATUSES.ASSIGNED,
  assignee_id: 'user_karthik',
  auditor_id: 'user_prathvi',
  version: 1
};

// First user acts with expectedVersion: 1 -> SUCCEEDS
const move1 = await executeTransition({
  filing: cardV1,
  expectedVersion: 1,
  toStatus: PATENT_STATUSES.FILING,
  actorId: 'user_karthik',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(move1.success === true, 'First user move on version 1 succeeds');
assert(move1.filing.version === 2, 'Filing is now at version 2');

// Second user had stale card at expectedVersion: 1 -> CONFLICT
const move2 = await executeTransition({
  filing: move1.filing, // Filing is now at v2
  expectedVersion: 1,   // Stale client still sends expectedVersion: 1
  toStatus: PATENT_STATUSES.FILING,
  actorId: 'user_karthik',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(move2.success === false, 'Second simultaneous move with stale version is rejected (Criteria 8)');
assert(move2.status === 409, 'Conflict returns HTTP 409 status code');
assert(move2.error === 'This filing was just updated — refresh.', 'Exact conflict message returned');

// ----------------------------------------------------
// Test Group 8: Illegal State Machine Transitions
// ----------------------------------------------------
console.log('\n--- TEST GROUP 8: Illegal State Transitions Guard ---');

// ASSIGNED cannot jump directly to PAYMENT
const invalidJump = validateStateTransition({
  filing: cardV1,
  toStatus: PATENT_STATUSES.PAYMENT,
  actorId: 'user_karthik',
  actorRoles: [PATENT_ROLES.ASSIGNEE]
});
assert(invalidJump.valid === false, 'Illegal status jump from ASSIGNED to PAYMENT is blocked');
assert(invalidJump.status === 403, 'Illegal status jump returns HTTP 403');

// Non-module actor cannot do any transition
const nonModuleUser = validateStateTransition({
  filing: cardV1,
  toStatus: PATENT_STATUSES.FILING,
  actorId: 'user_stranger',
  actorRoles: [] // No roles
});
assert(nonModuleUser.valid === false, 'User with no module roles is blocked from all transitions');
assert(nonModuleUser.status === 403, 'Non-module user returns HTTP 403');

console.log('\n=====================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('=====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
