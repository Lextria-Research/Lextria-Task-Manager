import fs from 'fs';
import { supabase } from '../src/supabaseClient.js';

async function exportTasksToMd() {
  console.log('Fetching departments, boards, agents...');
  const { data: departments } = await supabase.from('departments').select('*').order('position', { ascending: true });
  const { data: boards } = await supabase.from('boards').select('*').order('position', { ascending: true });
  const { data: agents } = await supabase.from('agents').select('*').order('name', { ascending: true });

  const agentMap = new Map();
  (agents || []).forEach(a => agentMap.set(a.id, a));
  const boardMap = new Map();
  (boards || []).forEach(b => boardMap.set(b.id, b));
  const deptMap = new Map();
  (departments || []).forEach(d => deptMap.set(d.id, d));

  console.log('Fetching all tasks (paginated)...');
  let allTasks = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) {
      console.error('Error fetching tasks:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allTasks.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Fetched ${allTasks.length} tasks total.`);

  const activeTasks = allTasks.filter(t => !t.completed && !t.is_archived);
  const completedTasks = allTasks.filter(t => t.completed && !t.is_archived);
  const archivedTasks = allTasks.filter(t => t.is_archived);

  let md = '# Tasks Tab - Complete Data and History Archive\n\n';
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += '## Summary Overview\n\n';
  md += `- **Total Tasks in Database:** ${allTasks.length}\n`;
  md += `- **Active Tasks:** ${activeTasks.length}\n`;
  md += `- **Completed Tasks (Recent/Unarchived):** ${completedTasks.length}\n`;
  md += `- **Archived Tasks (History):** ${archivedTasks.length}\n`;
  md += `- **Departments Count:** ${departments?.length || 0}\n`;
  md += `- **Boards Count:** ${boards?.length || 0}\n`;
  md += `- **Agents (Team Members) Count:** ${agents?.length || 0}\n\n`;

  md += '## Departments & Boards\n\n';
  md += '| Department | Board | Board ID |\n';
  md += '|---|---|---|\n';
  (boards || []).forEach(b => {
    const d = deptMap.get(b.department_id);
    md += `| ${d ? d.name : 'N/A'} | ${b.name} | ${b.id} |\n`;
  });
  md += '\n';

  md += '## Team Members (Agents)\n\n';
  md += '| Name | Role | Department | Board | Agent ID |\n';
  md += '|---|---|---|---|---|\n';
  (agents || []).forEach(a => {
    const b = boardMap.get(a.board_id);
    const d = b ? deptMap.get(b.department_id) : null;
    md += `| ${a.name || 'N/A'} | ${a.role || 'N/A'} | ${d ? d.name : 'N/A'} | ${b ? b.name : 'N/A'} | ${a.id} |\n`;
  });
  md += '\n';

  md += `## Active Tasks (${activeTasks.length})\n\n`;
  md += '| ID | Assignee (Agent) | Title | Priority | Due Date | Tag | Est. Time (hrs) | Description | Created At |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  activeTasks.forEach(t => {
    const a = agentMap.get(t.agent_id);
    const title = (t.title || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const desc = (t.description || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    md += `| ${t.id} | ${a ? a.name : t.agent_id || 'Unassigned'} | ${title} | ${t.priority || 'Normal'} | ${t.due_date || '-'} | ${t.tag || '-'} | ${t.required_time ?? '-'} | ${desc} | ${t.created_at || '-'} |\n`;
  });
  md += '\n';

  md += `## Completed Tasks (Recent) (${completedTasks.length})\n\n`;
  md += '| ID | Assignee (Agent) | Title | Priority | Completed Date | Required Time (hrs) | Created At |\n';
  md += '|---|---|---|---|---|---|---|\n';
  completedTasks.forEach(t => {
    const a = agentMap.get(t.agent_id);
    const title = (t.title || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    md += `| ${t.id} | ${a ? a.name : t.agent_id || 'Unassigned'} | ${title} | ${t.priority || 'Normal'} | ${t.completed_date || t.custom_completed_at || '-'} | ${t.required_time ?? '-'} | ${t.created_at || '-'} |\n`;
  });
  md += '\n';

  md += `## Archived Task History (${archivedTasks.length})\n\n`;
  md += '| ID | Assignee (Agent) | Title | Priority | Completed Date | Tag | Required Time (hrs) | Created At |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  archivedTasks.forEach(t => {
    const a = agentMap.get(t.agent_id);
    const title = (t.title || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    md += `| ${t.id} | ${a ? a.name : t.agent_id || 'Unassigned'} | ${title} | ${t.priority || 'Normal'} | ${t.completed_date || t.custom_completed_at || '-'} | ${t.tag || '-'} | ${t.required_time ?? '-'} | ${t.created_at || '-'} |\n`;
  });
  md += '\n';

  fs.writeFileSync('TASKS_DATA_AND_HISTORY.md', md, 'utf8');
  console.log('Saved TASKS_DATA_AND_HISTORY.md successfully! File size:', fs.statSync('TASKS_DATA_AND_HISTORY.md').size, 'bytes');
}

exportTasksToMd().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});

