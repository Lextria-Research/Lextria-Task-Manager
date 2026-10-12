// test_leader_and_confidentiality.js
import { isLeaderOrSharan, isSameMember, parseTicketData } from './src/attachmentUtils.js';

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
  ];
}

const pranavTabs = getNavigationTabs({ name: 'Pranav Bhat', role: 'leader' });
assert(pranavTabs.length === 4, 'Leader has 4 tabs');
assert(pranavTabs[0].id === 'leader-board', 'Leader tab is the FIRST tab');
assert(pranavTabs[0].label === 'Leader Workspace', 'Leader tab labeled correctly');

const sharanTabs = getNavigationTabs({ name: 'Sharan', role: 'member' });
assert(sharanTabs.length === 4, 'Sharan has 4 tabs');
assert(sharanTabs[0].id === 'leader-board', 'Sharan has leader tab as the FIRST tab');

const mahekTabs = getNavigationTabs({ name: 'Mahek', role: 'member' });
assert(mahekTabs.length === 3, 'Member Mahek only has 3 tabs');
assert(!mahekTabs.some(t => t.id === 'leader-board'), 'Leader tab is completely absent for Mahek');
assert(mahekTabs[0].id === 'tasks', 'Member first tab is tasks');

console.log(`\n=====================================================`);
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log(`=====================================================`);

if (passedTests !== totalTests) {
  process.exit(1);
}
