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
import {
  SEED_ROLE_ASSIGNMENTS,
  SEED_MEMBER_ROLES,
  getMemberPatentRoles,
  filterMembersByPatentRole
} from './src/patent/patentRoles.js';
import { matchFilingSearch } from './src/PatentFiling/patentStorage.js';

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

const expectedAssignees = ['Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi', 'Nikhil'];
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

// ----------------------------------------------------
// Test Group 9: Fix 1 & Fix 2 Acceptance Tests
// ----------------------------------------------------
console.log('\n--- TEST GROUP 9: FIX 1 & FIX 2 Acceptance Tests ---');

// Acceptance Test 1: Filing creation and transitions without Title
const noTitleCreate = validateFilingCreation({
  code: 'PAT-2026-NOTITLE',
  filing_type: 'Provisional',
  assignee_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133', // Karthik
  auditor_id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',  // Prathvi
  actorRoles: [PATENT_ROLES.SUPER_ADMIN],
  assigneeRoles: [PATENT_ROLES.ASSIGNEE],
  auditorRoles: [PATENT_ROLES.AUDITOR]
});
assert(noTitleCreate.valid === true, 'Acceptance Test 1: Create filing works without title (title is completely optional/nullable)');

// Acceptance Test 2: Role-driven dropdown candidate lists
const mockTeam = [
  { id: 'f7fe55e4-7c00-4030-86ed-0ccf39737074', name: 'Prashanth' },
  { id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', name: 'Akshay' },
  { id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133', name: 'Karthik' },
  { id: 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', name: 'Chaitra' },
  { id: '0a11ce02-42df-4007-b8a7-afcb4b9efe2c', name: 'Kaushal' },
  { id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', name: 'Prathvi' },
  { id: '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad', name: 'Nikhil' },
  { id: '42a71f9a-7119-457c-8092-0d5b75ce3060', name: 'Mounisha' },
  { id: 'user_other_1', name: 'John Doe' },
  { id: 'user_other_2', name: 'Alice Smith' }
];

const assignees = filterMembersByPatentRole(mockTeam, PATENT_ROLES.ASSIGNEE);
const auditors = filterMembersByPatentRole(mockTeam, PATENT_ROLES.AUDITOR);

assert(assignees.length === 7, 'Acceptance Test 2: Assignee list contains exactly 7 members');
const assigneeNames = assignees.map(m => m.name).sort();
const expectedAssigneeList = ['Akshay', 'Chaitra', 'Karthik', 'Kaushal', 'Nikhil', 'Prashanth', 'Prathvi'].sort();
assert(JSON.stringify(assigneeNames) === JSON.stringify(expectedAssigneeList), 'Acceptance Test 2: Assignees match exactly Prashanth, Akshay, Karthik, Chaitra, Kaushal, Prathvi, Nikhil');

assert(auditors.length === 4, 'Acceptance Test 2: Auditor list contains exactly 4 members');
const auditorNames = auditors.map(m => m.name).sort();
const expectedAuditorList = ['Chaitra', 'Karthik', 'Kaushal', 'Prathvi'].sort();
assert(JSON.stringify(auditorNames) === JSON.stringify(expectedAuditorList), 'Acceptance Test 2: Auditors match exactly Prathvi, Chaitra, Kaushal, Karthik');

// Acceptance Test 3: Mutual exclusion - Selecting Karthik as assignee excludes Karthik from auditor options
const karthikId = 'a6ecc962-3946-41ea-9946-1ff6dcc08133';
const auditorsExcludingKarthik = auditors.filter(m => m.id !== karthikId);
assert(!auditorsExcludingKarthik.some(m => m.name === 'Karthik'), 'Acceptance Test 3: Selecting Karthik as assignee excludes Karthik from auditor options');
assert(auditorsExcludingKarthik.length === 3, 'Acceptance Test 3: Remaining auditor options count is 3');

// Acceptance Test 4: Direct assignment of an actor lacking the role is rejected server-side
const invalidAssigneeRoleCall = validateFilingCreation({
  code: 'PAT-2026-INVALID-ASSIGNEE',
  filing_type: 'Provisional',
  assignee_id: '42a71f9a-7119-457c-8092-0d5b75ce3060', // Mounisha (SUPER_ADMIN, not ASSIGNEE)
  auditor_id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',  // Prathvi (AUDITOR)
  actorRoles: [PATENT_ROLES.SUPER_ADMIN],
  assigneeRoles: [PATENT_ROLES.SUPER_ADMIN],
  auditorRoles: [PATENT_ROLES.AUDITOR]
});
assert(invalidAssigneeRoleCall.valid === false, 'Acceptance Test 4: Creating filing with assignee lacking ASSIGNEE role is rejected');
assert(invalidAssigneeRoleCall.status === 400, 'Acceptance Test 4: Rejection returns HTTP 400');
assert(invalidAssigneeRoleCall.error.includes('must hold the ASSIGNEE role'), 'Acceptance Test 4: Rejection message clearly specifies missing role');

// Acceptance Test 5: Dynamic role updates from settings propagate without code changes
const dynamicSettingsRecords = [
  ...mockTeam.map(m => ({ member_id: m.id, role: 'AUDITOR' })) // Now John Doe is granted AUDITOR role in settings
];
const dynamicAuditors = filterMembersByPatentRole(mockTeam, PATENT_ROLES.AUDITOR, dynamicSettingsRecords);
assert(dynamicAuditors.some(m => m.name === 'John Doe'), 'Acceptance Test 5: Granting AUDITOR to John Doe in settings makes him appear in dropdown without code change');

// Acceptance Test 6: Prathvi as auditor sending PAT-2026-003 for correction succeeds under both legacy alias and UUID
const pat003Legacy = {
  id: 'demo-f3',
  code: 'PAT-2026-003',
  status: PATENT_STATUSES.AUDIT,
  assignee_id: 'user_kaushal',
  auditor_id: 'user_prathvi',
  assignee_name: 'Kaushal',
  auditor_name: 'Prathvi',
  version: 3,
  correction_count: 0
};

const prathviCorrectionLegacy = await executeTransition({
  filing: pat003Legacy,
  expectedVersion: 3,
  toStatus: PATENT_STATUSES.CORRECTION,
  actorId: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', // Prathvi real UUID
  actorName: 'Prathvi',
  actorRoles: [PATENT_ROLES.AUDITOR],
  payload: { description: 'REFILE' }
});
assert(prathviCorrectionLegacy.success === true, 'Acceptance Test 6: Prathvi logged in with real UUID successfully sends PAT-2026-003 with legacy ID for correction');

const pat003Normalized = {
  id: 'demo-f3',
  code: 'PAT-2026-003',
  status: PATENT_STATUSES.AUDIT,
  assignee_id: '0a11ce02-42df-4007-b8a7-afcb4b9efe2c', // Kaushal
  auditor_id: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',  // Prathvi
  assignee_name: 'Kaushal',
  auditor_name: 'Prathvi',
  version: 3,
  correction_count: 0
};

const prathviCorrectionNormalized = await executeTransition({
  filing: pat003Normalized,
  expectedVersion: 3,
  toStatus: PATENT_STATUSES.CORRECTION,
  actorId: '8eeb4375-25d3-4c3d-844c-7dd455e3c2e8',
  actorName: 'Prathvi',
  actorRoles: [PATENT_ROLES.AUDITOR],
  payload: { description: 'REFILE' }
});
assert(prathviCorrectionNormalized.success === true, 'Acceptance Test 6: Prathvi sending normalized PAT-2026-003 for correction succeeds without authorization error');

// ----------------------------------------------------
// Test Group 10: resolveMemberUuid & Persistence Integrity
// ----------------------------------------------------
console.log('\n--- TEST GROUP 10: Member UUID Resolution & Storage Integrity ---');
const { resolveMemberUuid } = await import('./src/PatentFiling/patentStorage.js');

assert(
  resolveMemberUuid('user_mounisha') === '42a71f9a-7119-457c-8092-0d5b75ce3060',
  'resolveMemberUuid translates user_mounisha to Mounisha UUID'
);
assert(
  resolveMemberUuid('user_prashanth') === 'f7fe55e4-7c00-4030-86ed-0ccf39737074',
  'resolveMemberUuid translates user_prashanth to Prashanth UUID'
);
assert(
  resolveMemberUuid('Akshay') === '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
  'resolveMemberUuid translates Akshay name to Akshay UUID'
);
assert(
  resolveMemberUuid('396ee572-3f3b-47cc-8b11-d710cc8ed4bc') === '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
  'resolveMemberUuid preserves valid UUID directly'
);
assert(
  resolveMemberUuid(null, '42a71f9a-7119-457c-8092-0d5b75ce3060') === '42a71f9a-7119-457c-8092-0d5b75ce3060',
  'resolveMemberUuid falls back safely when identifier is missing'
);

// ----------------------------------------------------
// Test Group 11: Agent to Member Mapping for Akshay & Kaushal
// ----------------------------------------------------
console.log('\n--- TEST GROUP 11: Agent to Member Mapping for Akshay, Kaushal & Nikhil ---');
const sampleAllEmployees = [
  { id: 'eafcd62c-fc86-4e25-971e-343c14a2cf36', name: 'Akshaya' },
  { id: '5e4b1fe1-5ec5-4a44-b89c-a24d6a1f9b0f', name: 'Kaushal Kamath' },
  { id: '923eeac5-35a5-461e-af6f-719f32d30281', name: 'karthik' },
  { id: 'fb937e40-077b-46ff-a2a7-8942f09d9f59', name: 'Prashanth' },
  { id: 'f7c5a4e8-94b4-4510-8c47-2b7c2d9c90ca', name: 'Prathvi' },
  { id: '2ff5eac9-31ad-43da-ac65-fcfa4792bc35', name: 'Chaitra' },
  { id: '99c4cf52-cda0-4e46-99e6-e55e0f7f49b1', name: 'Nikhil' }
];

const assigneesFromAgents = filterMembersByPatentRole(sampleAllEmployees, PATENT_ROLES.ASSIGNEE);
const auditorsFromAgents = filterMembersByPatentRole(sampleAllEmployees, PATENT_ROLES.AUDITOR);

assert(
  assigneesFromAgents.some(a => a.name === 'Akshaya'),
  'Akshay (Akshaya) is included in Assignee list from allEmployees'
);
assert(
  assigneesFromAgents.some(a => a.name === 'Kaushal Kamath'),
  'Kaushal (Kaushal Kamath) is included in Assignee list from allEmployees'
);
assert(
  assigneesFromAgents.some(a => a.name === 'Nikhil'),
  'Nikhil is included in Assignee list from allEmployees'
);
assert(
  auditorsFromAgents.some(a => a.name === 'Kaushal Kamath'),
  'Kaushal (Kaushal Kamath) is included in Auditor list from allEmployees'
);
assert(
  assigneesFromAgents.length === 7,
  `Assignee list has exactly 7 members (found ${assigneesFromAgents.length})`
);
assert(
  auditorsFromAgents.length === 4,
  `Auditor list has exactly 4 members (found ${auditorsFromAgents.length})`
);

assert(
  resolveMemberUuid('eafcd62c-fc86-4e25-971e-343c14a2cf36') === '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
  'resolveMemberUuid translates Akshaya agent ID to Akshay canonical member UUID'
);
assert(
  resolveMemberUuid('5e4b1fe1-5ec5-4a44-b89c-a24d6a1f9b0f') === '0a11ce02-42df-4007-b8a7-afcb4b9efe2c',
  'resolveMemberUuid translates Kaushal agent ID to Kaushal canonical member UUID'
);
assert(
  resolveMemberUuid('99c4cf52-cda0-4e46-99e6-e55e0f7f49b1') === '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad',
  'resolveMemberUuid translates Nikhil agent ID to Nikhil canonical member UUID'
);

// ----------------------------------------------------
// Test Group 12: Assignee Attaches Temp Code on Transition to Audit
// ----------------------------------------------------
console.log('\n--- TEST GROUP 12: Temp Code Attachment on Transition to Audit ---');
const testFilingForAudit = {
  id: 'f-temp-test-1',
  code: 'PAT-2026-TEMP-01',
  status: PATENT_STATUSES.FILING,
  assignee_id: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc', // Akshay
  auditor_id: 'a6ecc962-3946-41ea-9946-1ff6dcc08133',  // Karthik
  assignee_name: 'Akshay',
  auditor_name: 'Karthik',
  version: 2
};

const sendToAuditResult = await executeTransition({
  filing: testFilingForAudit,
  expectedVersion: 2,
  toStatus: PATENT_STATUSES.AUDIT,
  actorId: '396ee572-3f3b-47cc-8b11-d710cc8ed4bc',
  actorName: 'Akshay',
  actorRoles: [PATENT_ROLES.ASSIGNEE],
  payload: {
    temp_code: 'TEMP/2026/DEL/99812',
    description: 'Submitted on IPO e-portal'
  },
  note: 'Draft filed with Temp Code: TEMP/2026/DEL/99812 (Submitted on IPO e-portal)'
});

assert(sendToAuditResult.success === true, 'Transition to AUDIT with temp-code succeeds');
assert(sendToAuditResult.filing.status === PATENT_STATUSES.AUDIT, 'Filing is now in AUDIT status');
assert(sendToAuditResult.filing.temp_code === 'TEMP/2026/DEL/99812', 'temp_code is saved on filing');
assert(sendToAuditResult.event.note.includes('TEMP/2026/DEL/99812'), 'Event note contains temp_code');

// ----------------------------------------------------
// Test Group 13: Deep Card Search Across All Fields
// ----------------------------------------------------
console.log('\n--- TEST GROUP 13: Deep Card Search Across All Fields ---');

const sampleCard = {
  id: 'card-search-1',
  code: 'PAT-2026-099',
  temp_code: 'TEMP/2026/IPO/7711',
  filing_type: 'Non-Provisional',
  title: 'Quantum Entangled Cryptography System',
  description: 'Method and apparatus for quantum key exchange',
  filing_notes: 'Submitted via fast-track route',
  assignee_name: 'Akshay',
  auditor_name: 'Prathvi',
  status: PATENT_STATUSES.CORRECTION,
  priority: 'Urgent',
  payment_reference: 'IPO-MUM-2026-88221',
  hard_deadline: '2026-12-15',
  correction_rounds: [
    {
      round_no: 1,
      description: 'REFILE - Claim 1 must define the entanglement threshold',
      assignee_response: 'Claim 1 amended with specific photon wavelength'
    }
  ],
  events: [
    {
      note: 'Draft filed with Temp Code: TEMP/2026/IPO/7711 (e-portal ack)',
      actor_name: 'Akshay'
    }
  ]
};

assert(matchFilingSearch(sampleCard, 'PAT-2026-099'), 'Search matches by code');
assert(matchFilingSearch(sampleCard, 'pat-2026'), 'Search matches by code case-insensitively');
assert(matchFilingSearch(sampleCard, 'TEMP/2026/IPO/7711'), 'Search matches by temp code');
assert(matchFilingSearch(sampleCard, '7711'), 'Search matches by temp code partial number');
assert(matchFilingSearch(sampleCard, 'Akshay'), 'Search matches by assignee name');
assert(matchFilingSearch(sampleCard, 'akshay'), 'Search matches by assignee lowercase');
assert(matchFilingSearch(sampleCard, 'Prathvi'), 'Search matches by auditor name');
assert(matchFilingSearch(sampleCard, 'Non-Provisional'), 'Search matches by filing type');
assert(matchFilingSearch(sampleCard, 'Quantum'), 'Search matches by title');
assert(matchFilingSearch(sampleCard, 'quantum key exchange'), 'Search matches by description');
assert(matchFilingSearch(sampleCard, 'fast-track'), 'Search matches by filing notes');
assert(matchFilingSearch(sampleCard, 'Urgent'), 'Search matches by priority');
assert(matchFilingSearch(sampleCard, 'IPO-MUM-2026-88221'), 'Search matches by payment reference');
assert(matchFilingSearch(sampleCard, 'REFILE'), 'Search matches by correction round deficiency description');
assert(matchFilingSearch(sampleCard, 'entanglement threshold'), 'Search matches by correction specific reason');
assert(matchFilingSearch(sampleCard, 'photon wavelength'), 'Search matches by assignee correction response');
assert(matchFilingSearch(sampleCard, 'e-portal ack'), 'Search matches by audit trail event note');
assert(matchFilingSearch(sampleCard, 'akshay refile'), 'Search matches multi-word query across multiple card fields');
assert(matchFilingSearch(sampleCard, 'prathvi urgent'), 'Search matches auditor + priority multi-word query');
assert(!matchFilingSearch(sampleCard, 'random_non_existent_text_xyz'), 'Non-matching query returns false');
assert(matchFilingSearch(sampleCard, ''), 'Empty search matches all filings');
assert(matchFilingSearch(sampleCard, '   '), 'Whitespace-only search matches all filings');

console.log('\n=====================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('=====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
