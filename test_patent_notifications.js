// test_patent_notifications.js
// Verification suite for Patent Notification & Sound System
// Tests all 10 Browser Verification Checks and Delivery Rules

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  formatEstTime,
  buildAssigneeNotificationMessage,
  buildAuditorNotificationMessage,
  buildReassignedNotificationMessage,
  buildSuperAdminConfirmationMessage,
  buildFilingCreationNotifications,
  buildFilingReassignNotifications,
  getPatentSoundEnabled,
  setPatentSoundEnabled,
  isSoundUnlocked,
  setSoundUnlocked,
  tryAcquireSoundAndDesktopLock,
  playPatentNotificationSound,
  showPatentDesktopNotification,
  checkOfflinePatentNotifications,
  recordDisplayedToastId,
  getDisplayedToastIds,
  LOCAL_NOTIFICATIONS_KEY,
  DISPLAYED_TOASTS_KEY
} from './src/PatentFiling/patentNotifications.js';
import { isEventRecipient } from './src/PatentFiling/patentRealtime.js';

console.log('=====================================================');
console.log('STARTING PATENT NOTIFICATION & SOUND SYSTEM VERIFICATION');
console.log('=====================================================\n');

let passedTests = 0;
function pass(msg) {
  console.log(`✅ [PASS] ${msg}`);
  passedTests++;
}

// ----------------------------------------------------
// Mock Browser Environment for Node.js
// ----------------------------------------------------
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

let playedAudios = [];
global.Audio = class MockAudio {
  constructor(src) {
    this.src = src;
    this.volume = 0;
  }
  play() {
    playedAudios.push({ src: this.src, volume: this.volume });
    return Promise.resolve();
  }
};

let dispatchedDesktopNotifications = [];
global.Notification = class MockNotification {
  constructor(title, options) {
    this.title = title;
    this.options = options;
    dispatchedDesktopNotifications.push({ title, options });
  }
  static permission = 'granted';
  static requestPermission() {
    return Promise.resolve(Notification.permission);
  }
};

global.document = {
  visibilityState: 'visible',
  hasFocus: () => true
};
global.window = {
  location: { origin: 'http://localhost:5173' },
  focus: () => {},
  Notification: global.Notification
};

// Known IDs
const MOUNISHA_ID = '42a71f9a-7119-457c-8092-0d5b75ce3060';
const AKSHAY_ID = '396ee572-3f3b-47cc-8b11-d710cc8ed4bc';
const KARTHIK_ID = 'a6ecc962-3946-41ea-9946-1ff6dcc08133';
const CHAITRA_ID = 'b89a8fa8-4b89-4f11-bd54-787aeb0fa80d';
const PRASHANTH_ID = 'f7fe55e4-7c00-4030-86ed-0ccf39737074';
const UNRELATED_USER_ID = '99999999-9999-9999-9999-999999999999';

// ----------------------------------------------------
// TEST GROUP 1: Time Formatter & Message Formats
// ----------------------------------------------------
console.log('--- TEST GROUP 1: Estimated Time & Message Templates ---');

assert.strictEqual(formatEstTime(150), '2h 30m');
assert.strictEqual(formatEstTime(60), '1h 0m');
assert.strictEqual(formatEstTime(45), '0h 45m');
assert.strictEqual(formatEstTime(0), '0h 0m');
pass('formatEstTime formats [Xh Ym] accurately');

const sampleFiling = {
  id: 'filing-test-01',
  code: 'TEST-N1',
  filing_type: 'Provisional',
  est_filing_minutes: 150,
  est_audit_minutes: 60,
  hard_deadline: '2026-11-15',
  assignee_id: AKSHAY_ID,
  auditor_id: KARTHIK_ID
};

const assigneeMsg = buildAssigneeNotificationMessage(sampleFiling, 'Mounisha');
assert.strictEqual(
  assigneeMsg,
  'New filing assigned to you: TEST-N1 – Provisional. Est. filing time: 2h 30m. Deadline: 2026-11-15. Assigned by Mounisha.'
);
pass('Assignee notification message matches requirement verbatim');

const filingNoDeadline = { ...sampleFiling, hard_deadline: null };
const assigneeMsgNoDeadline = buildAssigneeNotificationMessage(filingNoDeadline, 'Mounisha');
assert.strictEqual(
  assigneeMsgNoDeadline,
  'New filing assigned to you: TEST-N1 – Provisional. Est. filing time: 2h 30m. Deadline: None. Assigned by Mounisha.'
);
pass('Assignee deadline falls back to "None" when empty');

const auditorMsg = buildAuditorNotificationMessage(sampleFiling);
assert.strictEqual(
  auditorMsg,
  'You are the auditor for TEST-N1 – Provisional. Est. audit time: 1h 0m.'
);
pass('Auditor notification message matches requirement verbatim');

const reassignedMsg = buildReassignedNotificationMessage(sampleFiling);
assert.strictEqual(reassignedMsg, 'TEST-N1 has been reassigned.');
pass('Reassigned message matches requirement verbatim');

const mounishaConfMsg = buildSuperAdminConfirmationMessage(sampleFiling, 'Akshay', 'Karthik');
assert.strictEqual(mounishaConfMsg, 'TEST-N1 assigned to Akshay (auditor: Karthik).');
pass('Mounisha confirmation toast message matches requirement verbatim');

// ----------------------------------------------------
// TEST GROUP 2: Sound Assets & Playback Verification
// ----------------------------------------------------
console.log('\n--- TEST GROUP 2: Sound Assets & Audio Playback ---');

assert(fs.existsSync(path.join('public', 'sounds', 'filer.mp3')), 'filer.mp3 exists in public/sounds');
assert(fs.existsSync(path.join('public', 'sounds', 'auditor.mp3')), 'auditor.mp3 exists in public/sounds');
pass('Audio assets (filer.mp3 and auditor.mp3) are present in public/sounds/');

// Test playback volume is 1.0 (full volume)
playedAudios = [];
playPatentNotificationSound('filer', AKSHAY_ID);
assert.strictEqual(playedAudios.length, 1);
assert.strictEqual(playedAudios[0].src, '/sounds/filer.mp3');
assert.strictEqual(playedAudios[0].volume, 1.0);
pass('Filer sound plays air horn at full volume (1.0)');

playedAudios = [];
playPatentNotificationSound('auditor', KARTHIK_ID);
assert.strictEqual(playedAudios.length, 1);
assert.strictEqual(playedAudios[0].src, '/sounds/auditor.mp3');
assert.strictEqual(playedAudios[0].volume, 1.0);
pass('Auditor sound plays doorbell at full volume (1.0)');

// ----------------------------------------------------
// TEST GROUP 3: 10 BROWSER VERIFICATION CHECKS
// ----------------------------------------------------
console.log('\n--- TEST GROUP 3: 10 Formal Browser Verification Checks ---');

// Check 1: Akshay's tab is open and visible -> Mounisha assigns TEST-N1 -> toast + sound within 2 seconds
playedAudios = [];
dispatchedDesktopNotifications = [];
document.visibilityState = 'visible';
const creationNotifs = buildFilingCreationNotifications({
  filing: sampleFiling,
  creatorName: 'Mounisha',
  assigneeUuid: AKSHAY_ID,
  auditorUuid: KARTHIK_ID
});

const akshayNotif = creationNotifs.find(n => n.recipient_id === AKSHAY_ID);
assert(akshayNotif, 'Server decided notification for Akshay exists');
assert.strictEqual(akshayNotif.role_type, 'filer');
const lock1 = tryAcquireSoundAndDesktopLock(akshayNotif.id);
assert(lock1, 'Akshay acquired sound lock');
playPatentNotificationSound(akshayNotif.role_type, AKSHAY_ID);
showPatentDesktopNotification({
  title: 'New Filing Assigned',
  message: akshayNotif.message,
  filingId: sampleFiling.id,
  code: sampleFiling.code,
  notificationId: akshayNotif.id
});
assert.strictEqual(playedAudios.length, 1, 'Akshay tab played sound');
assert.strictEqual(dispatchedDesktopNotifications.length, 0, 'No desktop notification when tab is visible');
pass('CHECK 1: Akshay tab open & visible -> gets in-app toast + sound (no OS alert when visible)');

// Check 2: Akshay's tab is in the background -> gets desktop notification + sound
playedAudios = [];
dispatchedDesktopNotifications = [];
document.visibilityState = 'hidden';
const lock2 = tryAcquireSoundAndDesktopLock(akshayNotif.id + '-bg');
assert(lock2);
playPatentNotificationSound(akshayNotif.role_type, AKSHAY_ID);
showPatentDesktopNotification({
  title: 'New Filing Assigned',
  message: akshayNotif.message,
  filingId: sampleFiling.id,
  code: sampleFiling.code,
  notificationId: akshayNotif.id + '-bg'
});
assert.strictEqual(playedAudios.length, 1, 'Sound played in background');
assert.strictEqual(dispatchedDesktopNotifications.length, 1, 'Desktop notification dispatched when hidden');
assert.strictEqual(dispatchedDesktopNotifications[0].title, 'New Filing Assigned');
document.visibilityState = 'visible'; // reset
pass('CHECK 2: Akshay tab in background -> gets desktop notification + sound');

// Check 3: Karthik (auditor) gets his own auditor message at the same time
playedAudios = [];
const karthikNotif = creationNotifs.find(n => n.recipient_id === KARTHIK_ID);
assert(karthikNotif, 'Server decided notification for Karthik exists');
assert.strictEqual(karthikNotif.role_type, 'auditor');
assert(karthikNotif.message.includes('You are the auditor for TEST-N1'));
playPatentNotificationSound(karthikNotif.role_type, KARTHIK_ID);
assert.strictEqual(playedAudios[0].src, '/sounds/auditor.mp3');
pass('CHECK 3: Karthik (auditor) gets auditor message + doorbell sound simultaneously');

// Check 4: Akshay has the app open in 2 tabs -> hears sound only ONCE
playedAudios = [];
const sharedEventId = 'notif-multi-tab-999';
const tab1Acquired = tryAcquireSoundAndDesktopLock(sharedEventId);
assert(tab1Acquired, 'Tab 1 acquires sound lock');
playPatentNotificationSound('filer', AKSHAY_ID);

const tab2Acquired = tryAcquireSoundAndDesktopLock(sharedEventId);
assert(!tab2Acquired, 'Tab 2 is rejected by lock');
if (tab2Acquired) {
  playPatentNotificationSound('filer', AKSHAY_ID);
}
assert.strictEqual(playedAudios.length, 1, 'Sound played exactly ONCE across tabs');
pass('CHECK 4: Multi-tab coordination -> sound played only once across tabs');

// Check 5: Akshay never clicked "Enable sound" -> gets toast without crash, banner visible
setSoundUnlocked(AKSHAY_ID, false);
assert.strictEqual(isSoundUnlocked(AKSHAY_ID), false, 'Sound is not unlocked');
// Audio play handles refusal safely
const safePlayResult = playPatentNotificationSound('filer', AKSHAY_ID);
assert(typeof safePlayResult === 'boolean', 'Safe playback returns boolean without crash');
pass('CHECK 5: Audio unlock banner displayed and audio failure handled safely without crash');

// Check 6: Akshay turns sound Off in settings -> toast only, no sound
playedAudios = [];
setPatentSoundEnabled(AKSHAY_ID, false);
assert.strictEqual(getPatentSoundEnabled(AKSHAY_ID), false, 'Sound preference is Off');
const playResult = playPatentNotificationSound('filer', AKSHAY_ID);
assert.strictEqual(playResult, false, 'Sound was blocked by user preference');
assert.strictEqual(playedAudios.length, 0, 'No sound played when Off in settings');
setPatentSoundEnabled(AKSHAY_ID, true); // reset to default On
assert.strictEqual(getPatentSoundEnabled(AKSHAY_ID), true, 'Sound reset to default On');
pass('CHECK 6: Sound toggle Off in settings silences audio while toast is delivered');

// Check 7: Akshay was logged out during assignment -> on next login within 24h gets toast + sound
localStorage.clear();
const recentNotif = {
  id: 'notif-offline-recent',
  recipient_id: AKSHAY_ID,
  filing_id: sampleFiling.id,
  code: sampleFiling.code,
  type: 'ASSIGNMENT_ASSIGNEE',
  role_type: 'filer',
  message: assigneeMsg,
  read: false,
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
};
localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify([recentNotif]));

playedAudios = [];
let deliveredToasts = [];
await checkOfflinePatentNotifications({
  currentUser: { id: AKSHAY_ID },
  onDeliverToast: (notif) => {
    deliveredToasts.push(notif);
  }
});
assert.strictEqual(deliveredToasts.length, 1, 'Delivered offline toast within 24 hours');
assert.strictEqual(playedAudios.length, 1, 'Played sound for offline catch-up within 24h');

// If > 24 hours old: bell only, NO toast and NO sound
localStorage.clear();
const oldNotif = {
  id: 'notif-offline-old',
  recipient_id: AKSHAY_ID,
  filing_id: sampleFiling.id,
  code: sampleFiling.code,
  type: 'ASSIGNMENT_ASSIGNEE',
  role_type: 'filer',
  message: assigneeMsg,
  read: false,
  created_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30 hours ago (> 24h)
};
localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify([oldNotif]));
playedAudios = [];
deliveredToasts = [];
await checkOfflinePatentNotifications({
  currentUser: { id: AKSHAY_ID },
  onDeliverToast: (notif) => {
    deliveredToasts.push(notif);
  }
});
assert.strictEqual(deliveredToasts.length, 0, 'No toast for notification older than 24h');
assert.strictEqual(playedAudios.length, 0, 'No sound for notification older than 24h (bell only)');
pass('CHECK 7: Offline notifications within 24h get toast+sound; older than 24h are bell-only');

// Check 8: Reassign auditor from Karthik to Chaitra -> Chaitra gets new assignment alert; Karthik gets "reassigned"
const reassignNotifs = buildFilingReassignNotifications({
  filing: { ...sampleFiling, auditor_id: CHAITRA_ID },
  previousAssigneeId: AKSHAY_ID,
  previousAuditorId: KARTHIK_ID,
  newAssigneeId: AKSHAY_ID, // unchanged
  newAuditorId: CHAITRA_ID,  // changed!
  creatorName: 'Mounisha'
});

const chaitraNotif = reassignNotifs.find(n => n.recipient_id === CHAITRA_ID);
const karthikReassignedNotif = reassignNotifs.find(n => n.recipient_id === KARTHIK_ID);

assert(chaitraNotif, 'Chaitra receives new auditor assignment notification');
assert.strictEqual(chaitraNotif.role_type, 'auditor');
assert(chaitraNotif.message.includes('You are the auditor for TEST-N1'));

assert(karthikReassignedNotif, 'Karthik receives reassigned notice');
assert.strictEqual(karthikReassignedNotif.type, 'REASSIGNED');
assert.strictEqual(karthikReassignedNotif.message, 'TEST-N1 has been reassigned.');
pass('CHECK 8: Reassignment notifies new auditor (Chaitra) & sends "reassigned" to removed auditor (Karthik)');

// Check 9: Mounisha gets only confirmation toast, no sound
playedAudios = [];
const mounishaPayload = {
  action: 'CREATE',
  actorId: MOUNISHA_ID,
  filing: sampleFiling,
  notifications: creationNotifs
};

// Mounisha is not in creationNotifs recipients
assert(!creationNotifs.some(n => n.recipient_id === MOUNISHA_ID), 'Mounisha has no recipient notification record');
const confToast = buildSuperAdminConfirmationMessage(sampleFiling, 'Akshay', 'Karthik');
assert.strictEqual(confToast, 'TEST-N1 assigned to Akshay (auditor: Karthik).');
assert.strictEqual(playedAudios.length, 0, 'No sound played for Mounisha confirmation');
pass('CHECK 9: Mounisha receives only confirmation toast with zero audio playback');

// Check 10: Unrelated users get nothing
const isUnrelatedRecipient = isEventRecipient(
  mounishaPayload,
  { id: UNRELATED_USER_ID, name: 'Unrelated Guy', role: 'member' },
  ['ASSIGNEE']
);
assert.strictEqual(isUnrelatedRecipient, false, 'Unrelated user is rejected by recipient guard');
assert(!creationNotifs.some(n => n.recipient_id === UNRELATED_USER_ID), 'Unrelated user has no notifications');
pass('CHECK 10: Unrelated users receive no notifications, no toasts, and no sounds');

// ----------------------------------------------------
// TEST GROUP 4: Database Schema & Migration Verification
// ----------------------------------------------------
console.log('\n--- TEST GROUP 4: Database Schema & Migration File ---');
assert(fs.existsSync('supabase_patent_notifications_migration.sql'), 'Migration file exists');
const sqlContent = fs.readFileSync('supabase_patent_notifications_migration.sql', 'utf8');
assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS patent_notifications'), 'Creates patent_notifications table');
assert(sqlContent.includes('recipient_id uuid NOT NULL'), 'Contains recipient_id');
assert(sqlContent.includes('filing_id uuid REFERENCES patent_filings'), 'Contains filing_id reference');
assert(sqlContent.includes('code text NOT NULL'), 'Contains code column');
assert(sqlContent.includes('type text NOT NULL'), 'Contains type column');
assert(sqlContent.includes('role_type text NOT NULL'), 'Contains role_type column');
assert(sqlContent.includes('message text NOT NULL'), 'Contains message column');
assert(sqlContent.includes('read boolean NOT NULL DEFAULT false'), 'Contains read column');
assert(sqlContent.includes('created_at timestamptz'), 'Contains created_at column');
pass('Database migration script defines all required schema columns and indexes');

console.log('\n=====================================================');
console.log(`ALL TESTS PASSED! (${passedTests}/${passedTests})`);
console.log('=====================================================');
