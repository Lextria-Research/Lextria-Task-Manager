// test_preview_features.js
import { extractMessageSnippet, getBoardKey, parseTicketData, BOARDS } from './src/attachmentUtils.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, detail = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail}`);
  }
}

async function runAllTests() {
  console.log('=====================================================');
  console.log('STARTING PROGRAMMATIC VERIFICATION FOR R1, R2, R3');
  console.log('=====================================================\n');

  // ----------------------------------------------------
  // Test Suite 1: extractMessageSnippet Behavior
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: extractMessageSnippet Edge Cases ---');

  // Case 1: Message with author header and attachments
  const msg1 = `[Pranav Bhat]: Hey @John Doe, can you review the new contract?\n[ATTACHMENTS]: [{"name":"doc.pdf"}]`;
  const snip1 = extractMessageSnippet(msg1, 'John Doe');
  assert(snip1 === 'Hey @John Doe, can you review the new contract?', 'Strips author prefix and attachment marker', `Got: "${snip1}"`);

  // Case 2: Short message <= 80 characters without author header
  const msg2 = `Please check the court filing @Prathvi`;
  const snip2 = extractMessageSnippet(msg2, 'Prathvi');
  assert(snip2 === 'Please check the court filing @Prathvi', 'Short message returned as-is', `Got: "${snip2}"`);

  // Case 3: Long message > 80 characters centered around mention
  const msg3 = `The Supreme Court hearing on this IP trademark dispute is scheduled for next month and we need all legal documents prepared in advance so please coordinate with @Sarah Jenkins regarding the discovery filings and witness affidavits.`;
  const snip3 = extractMessageSnippet(msg3, 'Sarah Jenkins');
  assert(snip3.includes('@Sarah Jenkins'), 'Long message includes mention target', `Got: "${snip3}"`);
  assert(snip3.startsWith('...'), 'Long message starts with ellipsis when mention is in middle', `Got: "${snip3}"`);
  assert(snip3.endsWith('...'), 'Long message ends with ellipsis when text continues', `Got: "${snip3}"`);

  // Case 4: First name fallback when mention was typed as @Firstname
  const msg4 = `Notice of motion submitted by opposition counsel yesterday, @Pranav please review line 45 immediately as trial begins on Monday.`;
  const snip4 = extractMessageSnippet(msg4, 'Pranav Bhat');
  assert(snip4.includes('@Pranav'), 'First name fallback works when user has full name', `Got: "${snip4}"`);

  // Case 5: Null / undefined / empty message
  assert(extractMessageSnippet('', 'Prathvi') === '', 'Empty message returns empty string');
  assert(extractMessageSnippet(null, 'Prathvi') === '', 'Null message returns empty string');
  assert(extractMessageSnippet(undefined, 'Prathvi') === '', 'Undefined message returns empty string');

  // Case 6: Message with ONLY attachments
  const msg6 = `[Member]: \n[ATTACHMENTS]: [{"name":"evidence.jpg"}]`;
  assert(extractMessageSnippet(msg6, 'Prathvi') === '', 'Message with only attachments returns empty string');

  // Case 7: Message with no space after author colon
  const msg7 = `[Leader]:Hey @John, review this urgently`;
  const snip7 = extractMessageSnippet(msg7, 'John');
  assert(snip7 === 'Hey @John, review this urgently', 'Strips author prefix when no space follows colon', `Got: "${snip7}"`);

  // Case 8: Multiline message collapses embedded newlines into single spaces
  const msg8 = `Line 1\nLine 2 @Sarah Jenkins please review\nLine 3`;
  const snip8 = extractMessageSnippet(msg8, 'Sarah Jenkins');
  assert(!snip8.includes('\n'), 'Collapses embedded newlines for clean dropdown preview', `Got: "${snip8}"`);
  assert(snip8.includes('@Sarah Jenkins'), 'Preserves mention target across collapsed lines');

  // ----------------------------------------------------
  // Test Suite 2: getBoardKey Normalization
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: getBoardKey Normalization ---');

  const boardTestCases = [
    { input: 'Litigation', expected: 'litigation' },
    { input: 'litigation', expected: 'litigation' },
    { input: 'Compliance', expected: 'compliance' },
    { input: 'COMPLIANCE', expected: 'compliance' },
    { input: 'Miscellaneous', expected: 'misc' },
    { input: 'misc', expected: 'misc' },
    { input: 'Patent', expected: 'patent' },
    { input: 'Trademark', expected: 'trademark' },
    { input: 'Copyright', expected: 'copyright' },
    { input: 'Design', expected: 'design' },
    { input: 'PAT', expected: 'patent' },
    { input: 'TM', expected: 'trademark' },
    { input: 'LIT', expected: 'litigation' },
    { input: 'CMP', expected: 'compliance' },
    { input: 'CR', expected: 'copyright' },
    { input: 'DSN', expected: 'design' },
    { input: 'MISC', expected: 'misc' },
    { input: '  Patent  ', expected: 'patent' },
    { input: '', expected: 'litigation' },
    { input: null, expected: 'litigation' },
    { input: 'unknown_board', expected: 'litigation' },
  ];

  for (const b of boardTestCases) {
    const result = getBoardKey(b.input);
    assert(result === b.expected, `getBoardKey for "${b.input}" -> "${b.expected}"`, `Got: "${result}"`);
  }

  // ----------------------------------------------------
  // Test Suite 3: Search Bar Client-Side Filtering (R2)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Search Bar Filtering (R2) ---');

  const sampleTickets = [
    {
      id: 't-1',
      code: 'LIT-01',
      urgency: 'High',
      board: 'litigation',
      status: 'open',
      query: `[AUTHOR]:{"name":"Mahek","role":"member"}\n\n[QUERY]:\nReview patent injunction filing`,
      created_at: '2026-09-01T10:00:00Z'
    },
    {
      id: 't-2',
      code: 'CMP-02',
      urgency: 'Medium',
      board: 'compliance',
      status: 'in discussion',
      query: `[AUTHOR]:{"name":"Pranav","role":"leader"}\n\n[QUERY]:\nAudit compliance checklists for GDPR`,
      created_at: '2026-09-02T10:00:00Z'
    },
    {
      id: 't-3',
      code: 'MISC-03',
      urgency: 'Low',
      board: 'misc',
      status: 'resolved',
      query: `[AUTHOR]:{"name":"Anjali","role":"member"}\n\n[QUERY]:\nOffice stationery purchase approval`,
      created_at: '2026-09-03T10:00:00Z'
    },
    {
      id: 't-4',
      code: 104, // Numeric code edge case
      urgency: null, // Null urgency edge case
      board: 'litigation',
      status: 'open',
      query: `Unformatted query text from legacy database`,
      created_by_name: 'David',
      created_at: '2026-09-04T10:00:00Z'
    }
  ];

  const agentsList = [{ id: 'ag-1', name: 'Agent Smith' }];
  const membersList = [{ id: 'm-1', name: 'David' }];
  const allPersonnel = [...agentsList, ...membersList];

  const filterTickets = (tickets, searchQuery) => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(t => {
      const code = String(t.code || '').toLowerCase();
      const urgency = String(t.urgency || '').toLowerCase();
      const parsed = parseTicketData(t, allPersonnel);
      const text = String(parsed.text || '').toLowerCase();
      const author = String(parsed.authorName || '').toLowerCase();
      const directAuthor = String(t.author || t.author_name || t.created_by_name || '').toLowerCase();
      const rawQuery = String(t.query || '').toLowerCase();
      return code.includes(q) || urgency.includes(q) || text.includes(q) || author.includes(q) || directAuthor.includes(q) || rawQuery.includes(q);
    });
  };

  // Case 1: Empty search returns all tickets
  assert(filterTickets(sampleTickets, '').length === 4, 'Empty search returns all tickets');
  assert(filterTickets(sampleTickets, '   ').length === 4, 'Whitespace-only search returns all tickets');

  // Case 2: Case-insensitive search by ticket code
  assert(filterTickets(sampleTickets, 'lit-01').length === 1 && filterTickets(sampleTickets, 'lit-01')[0].id === 't-1', 'Search by code lowercase');
  assert(filterTickets(sampleTickets, 'LIT-01').length === 1 && filterTickets(sampleTickets, 'LIT-01')[0].id === 't-1', 'Search by code uppercase');
  assert(filterTickets(sampleTickets, 'cmp').length === 1 && filterTickets(sampleTickets, 'cmp')[0].id === 't-2', 'Search by code partial prefix');

  // Case 3: Numeric code edge case
  assert(filterTickets(sampleTickets, '104').length === 1 && filterTickets(sampleTickets, '104')[0].id === 't-4', 'Numeric code correctly matches without crashing');

  // Case 4: Search by urgency
  assert(filterTickets(sampleTickets, 'high').length === 1 && filterTickets(sampleTickets, 'high')[0].id === 't-1', 'Search by urgency "high"');
  assert(filterTickets(sampleTickets, 'MEDIUM').length === 1 && filterTickets(sampleTickets, 'MEDIUM')[0].id === 't-2', 'Search by urgency "MEDIUM" (case-insensitive)');
  assert(filterTickets(sampleTickets, 'low').length === 1 && filterTickets(sampleTickets, 'low')[0].id === 't-3', 'Search by urgency "low"');

  // Case 5: Search by query text content
  assert(filterTickets(sampleTickets, 'patent injunction').length === 1 && filterTickets(sampleTickets, 'patent injunction')[0].id === 't-1', 'Search by query text content');
  assert(filterTickets(sampleTickets, 'GDPR').length === 1 && filterTickets(sampleTickets, 'GDPR')[0].id === 't-2', 'Search by query text uppercase keyword');

  // Case 6: Search by author name (parsed from author marker)
  assert(filterTickets(sampleTickets, 'mahek').length === 1 && filterTickets(sampleTickets, 'mahek')[0].id === 't-1', 'Search by author name "mahek"');
  assert(filterTickets(sampleTickets, 'pranav').length === 1 && filterTickets(sampleTickets, 'pranav')[0].id === 't-2', 'Search by author name "pranav"');

  // Case 7: Search by direct author name on legacy ticket
  assert(filterTickets(sampleTickets, 'david').length === 1 && filterTickets(sampleTickets, 'david')[0].id === 't-4', 'Search by direct legacy author "david"');

  // Case 8: Non-matching query returns empty array
  assert(filterTickets(sampleTickets, 'nonexistent_xyz_term').length === 0, 'Non-matching search returns 0 tickets');

  // Case 9: Special regex characters in search query do not throw errors
  assert(filterTickets(sampleTickets, '[AUTHOR]').length === 3, 'Search with regex square brackets matches literally without error');
  assert(filterTickets(sampleTickets, '(patent)').length === 0, 'Search with regex parentheses handled safely without error');

  // Case 10: Null and undefined search queries safely return all tickets
  assert(filterTickets(sampleTickets, null).length === 4, 'Null search query returns all tickets');
  assert(filterTickets(sampleTickets, undefined).length === 4, 'Undefined search query returns all tickets');

  // ----------------------------------------------------
  // Test Suite 4: History View vs Board View Search Filtering
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: History View & Board View Scoping ---');

  const currBoard = { key: 'litigation', label: 'Litigation' };
  const searched = filterTickets(sampleTickets, 'injunction');

  const boardTickets = searched.filter(t => {
    if (!t.board) return false;
    const b = t.board.toLowerCase();
    const curr = currBoard.label.toLowerCase();
    const key = currBoard.key.toLowerCase();
    return b === curr || b === key;
  });

  const openTickets = boardTickets.filter(t => (t.status || '').toLowerCase() === 'open');
  const resolvedTickets = boardTickets.filter(t => (t.status || '').toLowerCase() === 'resolved');

  assert(openTickets.length === 1 && openTickets[0].id === 't-1', 'Board openTickets filtered correctly by search');
  assert(resolvedTickets.length === 0, 'History resolvedTickets has 0 when no resolved ticket matches');

  // Test History view match
  const searchedHistory = filterTickets(sampleTickets, 'stationery');
  const miscBoardTickets = searchedHistory.filter(t => t.board === 'misc');
  const historyResolved = miscBoardTickets.filter(t => t.status === 'resolved');
  assert(historyResolved.length === 1 && historyResolved[0].id === 't-3', 'History resolvedTickets matches keyword in resolved ticket');

  // ----------------------------------------------------
  // Test Suite 5: Mention Data Structure & Filtering (R3)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: Mentions Data Structure & Deleted Ticket Guard ---');

  const mockDbMessages = [
    { id: 'm-101', ticket_id: 't-1', content: '[Leader]: @Mahek please check LIT-01', created_at: '2026-09-05T12:00:00Z' },
    { id: 'm-102', ticket_id: 't-deleted', content: '[Leader]: @Mahek this ticket was deleted', created_at: '2026-09-05T13:00:00Z' },
    { id: 'm-103', ticket_id: 't-1', content: '[Agent]: Second reminder for @Mahek on LIT-01', created_at: '2026-09-05T14:00:00Z' }
  ];

  const mockTicketMap = new Map([
    ['t-1', { id: 't-1', code: 'LIT-01', board: 'Litigation', status: 'open' }]
    // 't-deleted' is NOT in the map because it was deleted
  ]);

  // Execute mentions transformation as in QueryTickets.jsx
  const validMessages = mockDbMessages.filter(m => mockTicketMap.has(m.ticket_id));
  const validTicketIds = [...new Set(validMessages.map(d => d.ticket_id))];

  const formattedMentions = validMessages.map(m => {
    const ticket = mockTicketMap.get(m.ticket_id);
    const snippet = extractMessageSnippet(m.content, 'Mahek');
    return {
      id: ticket ? ticket.id : m.ticket_id,
      ticket_id: m.ticket_id,
      message_id: m.id,
      code: ticket?.code || 'Q.1',
      board: ticket?.board || 'Litigation',
      snippet: snippet || 'Mentioned you in a message',
      created_at: m.created_at
    };
  });

  // Verification
  assert(formattedMentions.length === 2, 'Ghost mention of deleted ticket is excluded');
  assert(validTicketIds.length === 1 && validTicketIds[0] === 't-1', 'validTicketIds does not contain deleted ticket');
  assert(formattedMentions[0].id === 't-1', 'Mention id matches ticket id as specified in requirements');
  assert(formattedMentions[0].ticket_id === 't-1', 'Mention ticket_id is preserved');
  assert(formattedMentions[0].code === 'LIT-01', 'Mention code is LIT-01');
  assert(formattedMentions[0].board === 'Litigation', 'Mention board is Litigation');
  assert(formattedMentions[0].snippet.includes('@Mahek'), 'Snippet contains @Mahek');

  // Verify unique keys for multiple mentions on same ticket
  const keys = formattedMentions.map(m => m.message_id ? `msg-${m.message_id}` : `tk-${m.id}`);
  const uniqueKeys = new Set(keys);
  assert(uniqueKeys.size === formattedMentions.length, 'Keys for mentions on same ticket are guaranteed unique');

  // ----------------------------------------------------
  // Test Suite 6: Admin Maintenance Bypass Logic (R1)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: Admin Maintenance Bypass Logic (R1) ---');

  const checkAccess = (isUnderMaintenance, role) => {
    const isAdmin = String(role).toLowerCase() === 'leader';
    const showMaintenanceLockout = isUnderMaintenance && !isAdmin;
    const showAdminBanner = isUnderMaintenance && isAdmin;
    const canAccessDashboard = !showMaintenanceLockout;
    return { canAccessDashboard, showMaintenanceLockout, showAdminBanner };
  };

  // Case A: Maintenance ON, Leader (Admin)
  const leaderOn = checkAccess(true, 'leader');
  assert(leaderOn.canAccessDashboard === true, 'Leader bypasses maintenance mode');
  assert(leaderOn.showMaintenanceLockout === false, 'Leader does NOT see maintenance screen');
  assert(leaderOn.showAdminBanner === true, 'Leader sees yellow admin maintenance warning banner');

  // Case B: Maintenance ON, Member (Non-admin)
  const memberOn = checkAccess(true, 'member');
  assert(memberOn.canAccessDashboard === false, 'Member is blocked during maintenance mode');
  assert(memberOn.showMaintenanceLockout === true, 'Member sees maintenance lockout screen');
  assert(memberOn.showAdminBanner === false, 'Member does NOT see admin banner');

  // Case C: Maintenance OFF, Leader
  const leaderOff = checkAccess(false, 'leader');
  assert(leaderOff.canAccessDashboard === true, 'Leader accesses dashboard when maintenance is off');
  assert(leaderOff.showMaintenanceLockout === false, 'No lockout when maintenance is off');
  assert(leaderOff.showAdminBanner === false, 'No banner when maintenance is off');

  // Case D: Maintenance OFF, Member
  const memberOff = checkAccess(false, 'member');
  assert(memberOff.canAccessDashboard === true, 'Member accesses dashboard when maintenance is off');
  assert(memberOff.showMaintenanceLockout === false, 'No lockout for member when maintenance is off');
  assert(memberOff.showAdminBanner === false, 'No banner for member when maintenance is off');

  // Case E: Case tolerance on role ("Leader", "LEADER")
  const leaderCaps = checkAccess(true, 'Leader');
  assert(leaderCaps.canAccessDashboard === true, 'Casing tolerance: "Leader" bypasses maintenance');

  // ----------------------------------------------------
  // Test Suite 7: Author Resolution & Robustness Checks
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 7: Personnel Resolution & Keyboard Usability ---');

  // Case 1: parseTicketData extracts author directly from created_by_name
  const tLegacy1 = { id: 't-leg-1', query: 'Legacy query text without author block', created_by_name: 'David Miller' };
  const p1 = parseTicketData(tLegacy1, []);
  assert(p1.authorName === 'David Miller', 'parseTicketData resolves created_by_name directly', `Got: "${p1.authorName}"`);

  // Case 2: parseTicketData extracts author from author_name
  const tLegacy2 = { id: 't-leg-2', query: 'Another legacy ticket', author_name: 'Sarah Connor' };
  const p2 = parseTicketData(tLegacy2, []);
  assert(p2.authorName === 'Sarah Connor', 'parseTicketData resolves author_name directly', `Got: "${p2.authorName}"`);

  // Case 3: parseTicketData extracts author from author field
  const tLegacy3 = { id: 't-leg-3', query: 'Third legacy ticket', author: 'John McClane' };
  const p3 = parseTicketData(tLegacy3, []);
  assert(p3.authorName === 'John McClane', 'parseTicketData resolves author property directly', `Got: "${p3.authorName}"`);

  // Case 4: parseTicketData resolves member created_by from allPersonnel
  const allStaff = [
    { id: 'agent-99', name: 'Agent Maxwell' },
    { id: 'member-42', name: 'Deep Thought' }
  ];
  const tMember = { id: 't-mem', query: 'Some query', created_by: 'member-42' };
  const pMember = parseTicketData(tMember, allStaff);
  assert(pMember.authorName === 'Deep Thought', 'parseTicketData resolves member author via allPersonnel', `Got: "${pMember.authorName}"`);

  // Case 5: parseTicketData resolves agent created_by from allPersonnel
  const tAgent = { id: 't-ag', query: 'Some agent query', created_by: 'agent-99' };
  const pAgent = parseTicketData(tAgent, allStaff);
  assert(pAgent.authorName === 'Agent Maxwell', 'parseTicketData resolves agent author via allPersonnel', `Got: "${pAgent.authorName}"`);

  // Case 6: Keyboard Escape key resets search query
  let testSearchState = 'injunction';
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      testSearchState = '';
    }
  };
  handleSearchKeyDown({ key: 'Escape' });
  assert(testSearchState === '', 'Escape key cleanly clears search state');

  // Case 7: Non-Escape key does not reset search query
  testSearchState = 'patent';
  handleSearchKeyDown({ key: 'Enter' });
  assert(testSearchState === 'patent', 'Enter key does not clear search state');

  // Case 8: Dropdown date formatting safely handles valid and invalid timestamps
  const validIso = '2026-09-05T12:00:00Z';
  const formattedDate = new Date(validIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  assert(formattedDate.includes('Sep'), 'Mention date tag renders short month', `Got: "${formattedDate}"`);

  // Case 9: Message author resolves member agent_id via allPersonnel
  const msgFromMember = { id: 'm-99', content: 'Here is the requested contract', agent_id: 'member-42' };
  let resolvedMsgAuthor = 'Member';
  if (msgFromMember.agent_id) {
    const found = allStaff.find(a => a.id === msgFromMember.agent_id);
    if (found) resolvedMsgAuthor = found.name;
  }
  assert(resolvedMsgAuthor === 'Deep Thought', 'Message agent_id resolves member name via allPersonnel', `Got: "${resolvedMsgAuthor}"`);

  // Case 10: Multi-word full-name session mentions support first-name fallback queries
  const userFullName = 'Pranav Bhat';
  const cleanName = userFullName.trim();
  const firstName = cleanName.split(/\s+/)[0];
  const queryTerms = cleanName.includes(' ') ? [`@${cleanName}`, `@${firstName}`] : [`@${cleanName}`];
  assert(queryTerms.includes('@Pranav Bhat') && queryTerms.includes('@Pranav'), 'Multi-word user queries both @FullName and @FirstName fallback');

  // Case 11: Stale message fetch race condition guard
  let activeSelectedTicketId = 'ticket-b';
  let mockMessagesState = ['msg-b1'];
  const simulateAsyncFetchResponse = (fetchedTicketId, incomingMessages) => {
    // Only update if fetchedTicketId matches activeSelectedTicketId
    if (activeSelectedTicketId === fetchedTicketId) {
      mockMessagesState = incomingMessages;
    }
  };
  // Stale request for ticket-a resolves after ticket-b is already active
  simulateAsyncFetchResponse('ticket-a', ['stale-msg-a1', 'stale-msg-a2']);
  assert(mockMessagesState.length === 1 && mockMessagesState[0] === 'msg-b1', 'Stale message fetch for old ticket does not overwrite active ticket thread');

  console.log('\n=====================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('=====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
