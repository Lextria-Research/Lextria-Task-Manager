// scripts/seed_patent_roles.js
// Seeds the default patent workflow roles for team members in Supabase

import { supabase } from '../src/supabaseClient.js';

export const SEED_ROLE_ASSIGNMENTS = {
  SUPER_ADMIN: ['Mounisha'],
  ASSIGNEE: ['Prashanth', 'Akshay', 'Karthik', 'Chaitra', 'Kaushal', 'Prathvi'],
  AUDITOR: ['Prathvi', 'Chaitra', 'Kaushal', 'Karthik'],
  ACK_CHECKER: ['Prashanth']
};

export async function seedPatentRoles(client = supabase) {
  console.log('Seeding Patent Workflow user roles...');

  // 1. Fetch all members
  const { data: members, error: memberErr } = await client
    .from('members')
    .select('id, name');

  if (memberErr || !members) {
    console.warn('⚠️ Could not fetch members from Supabase:', memberErr?.message);
    return { success: false, error: memberErr?.message };
  }

  const memberMap = new Map();
  members.forEach(m => {
    if (m.name) {
      memberMap.set(m.name.trim().toLowerCase(), m);
      memberMap.set(m.name.replace(/\s+/g, '').toLowerCase(), m);
    }
  });

  const rolesToInsert = [];
  for (const [role, names] of Object.entries(SEED_ROLE_ASSIGNMENTS)) {
    for (const name of names) {
      const cleanName = name.trim().toLowerCase();
      const matched = memberMap.get(cleanName) || memberMap.get(cleanName.replace(/\s+/g, ''));
      if (matched) {
        rolesToInsert.push({
          member_id: matched.id,
          role
        });
      } else {
        console.warn(`⚠️ Warning: Seed member "${name}" not found in members table.`);
      }
    }
  }

  if (rolesToInsert.length === 0) {
    console.log('No matching members found to seed.');
    return { success: false, count: 0 };
  }

  // 2. Insert into patent_user_roles
  const { data, error } = await client
    .from('patent_user_roles')
    .upsert(rolesToInsert, { onConflict: 'member_id, role' })
    .select();

  if (error) {
    console.warn('⚠️ Supabase patent_user_roles upsert error (run supabase_patent_workflow_migration.sql if table is not yet created):', error.message);
    return { success: false, error: error.message, pendingMigration: true };
  }

  console.log(`✅ Successfully seeded ${data?.length || rolesToInsert.length} patent role assignments.`);
  return { success: true, count: data?.length || rolesToInsert.length, data };
}

// Direct execution guard
if (process.argv[1] && process.argv[1].endsWith('seed_patent_roles.js')) {
  seedPatentRoles().then(res => {
    console.log('Seed result:', res);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal seed error:', err);
    process.exit(1);
  });
}
