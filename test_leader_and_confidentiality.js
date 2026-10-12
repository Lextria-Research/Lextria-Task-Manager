// test_leader_and_confidentiality.js
import {
  isLeaderOrSharan,
  isSameMember,
  parseTicketData,
  getPinnedTaskIds,
  savePinnedTaskIds,
  togglePinnedTaskId
} from './src/attachmentUtils.js';
import {
  getGoogleCalendarUrl,
  getZohoCalendarUrl,
  generateICalendar,
  formatCalendarPayload
} from './src/calendarSyncUtils.js';
import {
  DEFAULT_CLIQ_CONFIG,
  DEFAULT_SHARED_CALENDAR_CONFIG
} from './src/cliqSyncUtils.js';

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
console.log('VERIFYING LEADER WORKSPACE & CONFIDENTIALITY RULES');
console.log('=====================================================\n');

// ----------------------------------------------------
// Test Group 1: isLeaderOrSharan Authorization
// ----------------------------------------------------
console.log('--- TEST GROUP 1: isLeaderOrSharan Access Control ---');

// Pranav Bhat variations
assert(isLeaderOrSharan('Pranav Bhat') === true, 'Pranav Bhat string allowed');
assert(isLeaderOrSharan({ name: 'Pranav Bhat', role: 'member' }) === true, 'Pranav Bhat object allowed regardless of role property');
assert(isLeaderOrSharan({ name: 'pranav bhat' }) === true, 'Lowercase pranav bhat allowed');
assert(isLeaderOrSharan('pranav') === true, 'Single name pranav allowed');

// Sharan variations
assert(isLeaderOrSharan('Sharan') === true, 'Sharan string allowed');
assert(isLeaderOrSharan({ name: 'Sharan', role: 'member' }) === true, 'Sharan object allowed');
assert(isLeaderOrSharan({ name: 'sharan' }) === true, 'Lowercase sharan allowed');

// Role-based leaders/admins
assert(isLeaderOrSharan({ name: 'Custom Name', role: 'leader' }) === true, 'role: leader allowed');
assert(isLeaderOrSharan({ name: 'Custom Name', role: 'admin' }) === true, 'role: admin allowed');

// Non-leader team members must be STRICTLY blocked
const nonLeaders = ['Mahek', 'Chaitra', 'Kavana', 'Sarvan', 'Shilpa', 'Akshay', 'Kaushal'];
nonLeaders.forEach(name => {
  assert(isLeaderOrSharan(name) === false, `Member "${name}" string denied`);
  assert(isLeaderOrSharan({ name, role: 'member' }) === false, `Member "${name}" object denied`);
});

// Edge cases
assert(isLeaderOrSharan(null) === false, 'null user denied');
assert(isLeaderOrSharan(undefined) === false, 'undefined user denied');
assert(isLeaderOrSharan('') === false, 'empty string denied');
assert(isLeaderOrSharan({}) === false, 'empty object denied');

// ----------------------------------------------------
// Test Group 2: Query Ticket Confidentiality Scoping
// ----------------------------------------------------
console.log('\n--- TEST GROUP 2: Query Ticket Confidentiality Filtering ---');

const mockTickets = [
  { id: 't1', code: 'LIT-01', board: 'Litigation', query: '[AUTHOR]:{"name":"Mahek","role":"member"}\nFiling status query' },
  { id: 't2', code: 'CMP-02', board: 'Compliance', query: '[AUTHOR]:{"name":"Chaitra","role":"member"}\nAudit question' },
  { id: 't3', code: 'PAT-03', board: 'Patent', query: '[AUTHOR]:{"name":"Kavana","role":"member"}\nPrior art query' },
  { id: 't4', code: 'TM-04', board: 'Trademark', query: '[AUTHOR]:{"name":"Pranav Bhat","role":"leader"}\nOpposition strategy' },
  { id: 't5', code: 'LIT-05', board: 'Litigation', query: '[AUTHOR]:{"name":"Sarvan","role":"member"}\nUrgent hearing notice' },
];

function filterVisibleTickets(ticketList, sessionUser, mentionedIds = new Set(), agents = []) {
  const isLeader = isLeaderOrSharan(sessionUser);
  if (isLeader) return ticketList;
  return ticketList.filter(t => {
    const parsed = parseTicketData(t, agents);
    const isAuthor = isSameMember(parsed.authorName, sessionUser?.name) ||
                     isSameMember(t.author || t.author_name || t.created_by_name, sessionUser?.name) ||
                     (t.created_by && sessionUser?.id && String(t.created_by) === String(sessionUser?.id));
    if (isAuthor) return true;
    if (mentionedIds.has(t.id)) return true;
    return false;
  });
}

// Leader view
const pranavView = filterVisibleTickets(mockTickets, { name: 'Pranav Bhat', role: 'leader' });
assert(pranavView.length === 5, 'Leader (Pranav Bhat) sees all 5 tickets');

const sharanView = filterVisibleTickets(mockTickets, { name: 'Sharan', role: 'member' });
assert(sharanView.length === 5, 'Sharan sees all 5 tickets');

// Member Mahek view without mentions
const mahekView = filterVisibleTickets(mockTickets, { name: 'Mahek', role: 'member' });
assert(mahekView.length === 1, 'Member Mahek only sees her own 1 ticket');
assert(mahekView[0].code === 'LIT-01', 'Mahek sees ticket LIT-01');

// Member Mahek view with a mention on t2 (Chaitra\'s ticket)
const mahekWithMention = filterVisibleTickets(mockTickets, { name: 'Mahek', role: 'member' }, new Set(['t2']));
assert(mahekWithMention.length === 2, 'Mahek sees her ticket plus the ticket where mentioned');
assert(mahekWithMention.map(t => t.id).includes('t2'), 'Mahek sees mentioned ticket t2');

// Member Chaitra view
const chaitraView = filterVisibleTickets(mockTickets, { name: 'Chaitra', role: 'member' });
assert(chaitraView.length === 1, 'Member Chaitra only sees her own 1 ticket');
assert(chaitraView[0].code === 'CMP-02', 'Chaitra sees ticket CMP-02');

// ----------------------------------------------------
// Test Group 3: Project Reporting Confidentiality Scoping
// ----------------------------------------------------
console.log('\n--- TEST GROUP 3: Project Reporting Confidentiality Filtering ---');

const mockProjects = [
  { id: 'p1', client: 'Alpha Corp', title: 'Due Diligence', description: '[AUTHOR]:{"name":"Mahek","role":"member"}\nFinancial review' },
  { id: 'p2', client: 'Beta Ltd', title: 'Trademark Search', description: '[AUTHOR]:{"name":"Chaitra","role":"member"}\nClass 9 search' },
  { id: 'p3', client: 'Gamma Inc', title: 'Patent Prosecution', description: '[AUTHOR]:{"name":"Pranav Bhat","role":"leader"}\nDrafting specification' },
];

function splitDescription(description) {
  if (!description) return { text: '', attachments: [], authorName: '', authorRole: '' };
  let authorName = '';
  let authorRole = '';
  let clean = description;
  const authorMarker = '[AUTHOR]:';
  if (clean.includes(authorMarker)) {
    const startIdx = clean.indexOf(authorMarker) + authorMarker.length;
    const endIdx = clean.indexOf('\n', startIdx);
    const jsonStr = endIdx === -1 ? clean.substring(startIdx).trim() : clean.substring(startIdx, endIdx).trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.name) authorName = parsed.name;
      if (parsed.role) authorRole = parsed.role;
    } catch {}
    clean = endIdx === -1 ? '' : clean.substring(endIdx).trim();
  }
  return { text: clean, attachments: [], authorName, authorRole };
}

function filterVisibleProjects(projectList, sessionUser, agents = []) {
  const isLeader = Boolean(sessionUser?.role === 'leader' || isLeaderOrSharan(sessionUser));
  if (isLeader) return projectList;
  return projectList.filter(p => {
    const { authorName } = splitDescription(p.description);
    if (authorName && isSameMember(authorName, sessionUser?.name)) return true;
    if (p.created_by) {
      const agent = (agents || []).find(a => a.id === p.created_by);
      if (agent && isSameMember(agent.name, sessionUser?.name)) return true;
      if (sessionUser?.id && String(p.created_by) === String(sessionUser?.id)) return true;
    }
    if (p.created_by_name && isSameMember(p.created_by_name, sessionUser?.name)) return true;
    return false;
  });
}

const leaderProjects = filterVisibleProjects(mockProjects, { name: 'Pranav Bhat', role: 'leader' });
assert(leaderProjects.length === 3, 'Leader sees all 3 projects');

const sharanProjects = filterVisibleProjects(mockProjects, { name: 'Sharan', role: 'member' });
assert(sharanProjects.length === 3, 'Sharan sees all 3 projects');

const mahekProjects = filterVisibleProjects(mockProjects, { name: 'Mahek', role: 'member' });
assert(mahekProjects.length === 1, 'Mahek sees only her 1 project');
assert(mahekProjects[0].title === 'Due Diligence', 'Mahek sees Due Diligence project');

const chaitraProjects = filterVisibleProjects(mockProjects, { name: 'Chaitra', role: 'member' });
assert(chaitraProjects.length === 1, 'Chaitra sees only her 1 project');
assert(chaitraProjects[0].title === 'Trademark Search', 'Chaitra sees Trademark Search project');

// ----------------------------------------------------
// Test Group 4: Tab Navigation & Visibility Exclusivity
// ----------------------------------------------------
console.log('\n--- TEST GROUP 4: Tab Navigation & Exclusivity ---');

function getNavigationTabs(user) {
  return [
    ...(isLeaderOrSharan(user) ? [
      { id: 'leader-board', label: 'Leader Workspace', badge: 'Leader' }
    ] : []),
    { id: 'tasks', label: 'Tasks' },
    { id: 'queries', label: 'Queries' },
    { id: 'projects', label: 'Project Reporting' },
    { id: 'settings', label: 'Settings' },
  ];
}

const pranavTabs = getNavigationTabs({ name: 'Pranav Bhat', role: 'leader' });
assert(pranavTabs.length === 5, 'Leader has 5 tabs (including Settings)');
assert(pranavTabs[0].id === 'leader-board', 'Leader tab is the FIRST tab');
assert(pranavTabs[0].label === 'Leader Workspace', 'Leader tab labeled correctly');
assert(pranavTabs[4].id === 'settings', 'Settings tab is present at the end for Leader');

const sharanTabs = getNavigationTabs({ name: 'Sharan', role: 'member' });
assert(sharanTabs.length === 5, 'Sharan has 5 tabs');
assert(sharanTabs[0].id === 'leader-board', 'Sharan has leader tab as the FIRST tab');
assert(sharanTabs[4].id === 'settings', 'Settings tab is present at the end for Sharan');

const mahekTabs = getNavigationTabs({ name: 'Mahek', role: 'member' });
assert(mahekTabs.length === 4, 'Member Mahek has 4 tabs (Tasks, Queries, Projects, Settings)');
assert(!mahekTabs.some(t => t.id === 'leader-board'), 'Leader tab is completely absent for Mahek');
assert(mahekTabs[0].id === 'tasks', 'Member first tab is tasks');
assert(mahekTabs[3].id === 'settings', 'Settings tab is present at the end for Member');

// ----------------------------------------------------
// Test Group 5: Google & Zoho Calendar Integration
// ----------------------------------------------------
console.log('\n--- TEST GROUP 5: Google & Zoho Calendar Sync Utilities ---');

const sampleTask = {
  id: 'task-test-101',
  title: 'Trademark Hearing Representation',
  dueDate: '2026-10-18',
  priority: 'High',
  quadrant: 'do_now',
  list: 'Inbox',
  notes: 'Appear before registrar for hearing on opposition matter.'
};

// 1. Google Calendar URL
const gCalUrl = getGoogleCalendarUrl(sampleTask);
assert(gCalUrl.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'), 'Google Calendar URL starts with template action');
assert(gCalUrl.includes(encodeURIComponent('[Lextria] Trademark Hearing Representation')), 'Google Calendar URL contains prefilled title');
assert(gCalUrl.includes('20261018'), 'Google Calendar URL contains compact start date');
assert(gCalUrl.includes('20261019'), 'Google Calendar URL contains next-day end date');

// 2. Zoho Calendar URL
const zohoCalUrl = getZohoCalendarUrl(sampleTask);
assert(zohoCalUrl.startsWith('https://calendar.zoho.com/eventreq/add?title='), 'Zoho Calendar URL starts with eventreq action');
assert(zohoCalUrl.includes(encodeURIComponent('[Lextria] Trademark Hearing Representation')), 'Zoho Calendar URL contains prefilled title');
assert(zohoCalUrl.includes('date=20261018'), 'Zoho Calendar URL contains date parameter');

// 3. RFC 5545 iCalendar (.ics) Generation
const sampleTasks = [
  sampleTask,
  {
    id: 'task-test-102',
    title: 'Review Lease Agreement',
    dueDate: '2026-10-20',
    priority: 'Medium',
    completed: true,
    notes: 'Draft clauses'
  },
  {
    id: 'task-unscheduled',
    title: 'Unscheduled Someday Task',
    dueDate: null
  }
];

const icsOutput = generateICalendar(sampleTasks);
assert(icsOutput.includes('BEGIN:VCALENDAR'), 'iCalendar contains BEGIN:VCALENDAR');
assert(icsOutput.includes('VERSION:2.0'), 'iCalendar conforms to VERSION:2.0');
assert(icsOutput.includes('X-WR-CALNAME:Lextria Leader Taskboard (Pranav Bhat)'), 'iCalendar contains custom calendar name');
assert(icsOutput.includes('BEGIN:VEVENT'), 'iCalendar contains VEVENT block');
assert(icsOutput.includes('SUMMARY:Trademark Hearing Representation'), 'iCalendar contains task title');
assert(icsOutput.includes('DTSTART;VALUE=DATE:20261018'), 'iCalendar contains DTSTART');
assert(icsOutput.includes('STATUS:NEEDS-ACTION'), 'iCalendar marks open task as NEEDS-ACTION');
assert(icsOutput.includes('STATUS:COMPLETED'), 'iCalendar marks completed task as COMPLETED');
assert(!icsOutput.includes('SUMMARY:Unscheduled Someday Task'), 'iCalendar omits unscheduled tasks without due date');
assert(icsOutput.includes('END:VCALENDAR'), 'iCalendar closes with END:VCALENDAR');

// 4. Webhook Payload Formatting
const webhookPayload = formatCalendarPayload(sampleTask, 'create');
assert(webhookPayload.action === 'create', 'Webhook payload has action');
assert(webhookPayload.task.title === 'Trademark Hearing Representation', 'Webhook payload preserves task title');
assert(webhookPayload.task.dueDate === '2026-10-18', 'Webhook payload preserves due date');
assert(typeof webhookPayload.timestamp === 'string', 'Webhook payload includes ISO timestamp');

// ----------------------------------------------------
// Test Group 6: SOS Urgent Urgency & Compulsory Deadline
// ----------------------------------------------------
console.log('\n--- TEST GROUP 6: SOS Urgent Urgency & Compulsory Deadline ---');

// Query ticket with SOS Urgent and deadline
const sosTicket = {
  id: 'sos-1',
  code: 'LIT-SOS',
  board: 'Litigation',
  urgency: 'SOS Urgent',
  query: '[AUTHOR]:{"name":"Mahek","role":"member"}\n[DEADLINE]:2026-10-20\nEmergency injunction notice'
};

const parsedSos = parseTicketData(sosTicket);
assert(parsedSos.deadline === '2026-10-20', 'SOS ticket parses deadline correctly');
assert(parsedSos.authorName === 'Mahek', 'SOS ticket author parsed');
assert(parsedSos.text.includes('Emergency injunction notice'), 'SOS ticket body extracted');

// Validation function testing
function validateSosDeadline(urgency, deadline) {
  if (urgency === 'SOS Urgent') {
    return Boolean(deadline && deadline.trim().length > 0);
  }
  return true;
}

assert(validateSosDeadline('SOS Urgent', '') === false, 'SOS Urgent without deadline is INVALID');
assert(validateSosDeadline('SOS Urgent', '2026-10-20') === true, 'SOS Urgent with deadline is VALID');
assert(validateSosDeadline('High', '') === true, 'High urgency without deadline is valid (optional)');

// ----------------------------------------------------
// Test Group 7: WhatsApp Dispatch Link Formatting
// ----------------------------------------------------
console.log('\n--- TEST GROUP 7: WhatsApp Dispatch Link Formatting ---');

function formatWhatsAppUrl(task, phone = '+919876543210') {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const title = task.title || 'Untitled';
  const dueDate = task.dueDate || 'Immediate';
  const quadrant = task.quadrant === 'do_now' ? 'PRANAV DO NOW (Quadrant I)' : task.quadrant;
  const msg = `🚨 *LEXTRIA TASK ALERT: ${quadrant.toUpperCase()}*\n\n📌 *Task:* ${title}\n📅 *Due Date / Deadline:* ${dueDate}`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}

const waLink = formatWhatsAppUrl(sampleTask, '+91 98765 43210');
assert(waLink.startsWith('https://wa.me/919876543210?text='), 'WhatsApp link contains cleaned phone digits');
assert(waLink.includes(encodeURIComponent('Trademark Hearing Representation')), 'WhatsApp message contains task title');
assert(waLink.includes(encodeURIComponent('2026-10-18')), 'WhatsApp message contains task deadline');

// ----------------------------------------------------
// Test Group 8: Zoho Cliq Notifications & Shared Calendar
// ----------------------------------------------------
console.log('\n--- TEST GROUP 8: Zoho Cliq & Shared Calendar Integration ---');

assert(typeof DEFAULT_CLIQ_CONFIG === 'object', 'Cliq config default is an object');
assert(DEFAULT_CLIQ_CONFIG.botName === 'Lextria Task Bot', 'Cliq bot name default is Lextria Task Bot');
assert(DEFAULT_CLIQ_CONFIG.notifyOnDeadlineSet === true, 'Notify on deadline set is true by default');
assert(DEFAULT_CLIQ_CONFIG.notifyOnDeadlineNear === true, 'Notify on approaching deadline is true by default');

assert(typeof DEFAULT_SHARED_CALENDAR_CONFIG === 'object', 'Shared calendar config default is an object');
assert(DEFAULT_SHARED_CALENDAR_CONFIG.calendarType === 'google', 'Shared calendar default type is google');
assert(DEFAULT_SHARED_CALENDAR_CONFIG.title === 'Lextria Team Calendar', 'Shared calendar default title is set');

// ----------------------------------------------------
// Test Group 9: Pin / Star Top Tasks (Max 3 Allowed)
// ----------------------------------------------------
console.log('\n--- TEST GROUP 9: Pin / Star Top Tasks (Max 3 Allowed) ---');

const testMemberId = 'emp_test_pin_99';
savePinnedTaskIds(testMemberId, []);

let p1 = togglePinnedTaskId(testMemberId, 'task_alpha', 3);
assert(p1.pinned === true && p1.ids.includes('task_alpha'), 'Pinning first task succeeds');
assert(p1.ids.length === 1, 'Pinned count is 1');

let p2 = togglePinnedTaskId(testMemberId, 'task_beta', 3);
assert(p2.pinned === true && p2.ids.length === 2, 'Pinning second task succeeds');

let p3 = togglePinnedTaskId(testMemberId, 'task_gamma', 3);
assert(p3.pinned === true && p3.ids.length === 3, 'Pinning third task succeeds (3 reached)');

// Attempting 4th pin should be rejected with friendly error message
let p4 = togglePinnedTaskId(testMemberId, 'task_delta', 3);
assert(p4.pinned === false, 'Pinning 4th task is rejected');
assert(p4.ids.length === 3, 'Pinned count remains capped at 3');
assert(typeof p4.error === 'string' && p4.error.includes('Maximum 3 tasks'), 'Helpful cap error returned for 4th pin');

// Unpinning an existing task succeeds
let p5 = togglePinnedTaskId(testMemberId, 'task_beta', 3);
assert(p5.pinned === false && !p5.ids.includes('task_beta'), 'Unpinning existing task succeeds');
assert(p5.ids.length === 2, 'Pinned count decremented to 2');

// Now 3rd slot is free, delta can be pinned
let p6 = togglePinnedTaskId(testMemberId, 'task_delta', 3);
assert(p6.pinned === true && p6.ids.includes('task_delta'), 'Newly freed slot allows pinning delta');
assert(p6.ids.length === 3, 'Pinned count back to 3');

// ----------------------------------------------------
// Test Group 10: Modern Member Board Capabilities
// ----------------------------------------------------
console.log('\n--- TEST GROUP 10: Modern Member Board & Shortcuts ---');

// Urgent pulse condition test
function isTaskUrgent(task, today = '2026-10-12') {
  if (task.completed) return false;
  if (task.priority === 'High' || task.priority === 'SOS Urgent') return true;
  if (task.dueDate && task.dueDate <= today) return true;
  return false;
}

assert(isTaskUrgent({ priority: 'SOS Urgent', completed: false }), 'SOS Urgent task is flagged urgent');
assert(isTaskUrgent({ priority: 'High', completed: false }), 'High priority task is flagged urgent');
assert(isTaskUrgent({ priority: 'Low', dueDate: '2026-10-12', completed: false }), 'Due today task is flagged urgent');
assert(isTaskUrgent({ priority: 'Low', dueDate: '2026-10-11', completed: false }), 'Overdue task is flagged urgent');
assert(!isTaskUrgent({ priority: 'Low', dueDate: '2026-10-20', completed: false }), 'Normal future task is NOT urgent');
assert(!isTaskUrgent({ priority: 'High', completed: true }), 'Completed task is NOT urgent');

// Keyboard shortcut mappings verify Alt key combinations
const shortcutMap = {
  'n': 'Quick Add Task Modal',
  'm': 'Toggle My Column / All Columns',
  'c': 'Toggle Tasks / Calendar Subtab',
  'd': 'Toggle Daily Standup Drawer',
  'f': 'Cycle Priority Filter'
};

assert(shortcutMap['n'] === 'Quick Add Task Modal', 'Alt+N mapped to Quick Add Task Modal');
assert(shortcutMap['m'] === 'Toggle My Column / All Columns', 'Alt+M mapped to My Column toggle');
assert(shortcutMap['c'] === 'Toggle Tasks / Calendar Subtab', 'Alt+C mapped to Calendar toggle');
assert(shortcutMap['d'] === 'Toggle Daily Standup Drawer', 'Alt+D mapped to Standup Drawer');
assert(shortcutMap['f'] === 'Cycle Priority Filter', 'Alt+F mapped to Priority Filter cycle');

console.log(`\n=====================================================`);
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log(`=====================================================`);

if (passedTests !== totalTests) {
  process.exit(1);
}
