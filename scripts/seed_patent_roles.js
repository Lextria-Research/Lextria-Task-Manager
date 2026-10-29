// scripts/seed_patent_roles.js
// Seeds the default patent workflow roles for team members in Supabase

import { supabase } from '../src/supabaseClient.js';
import { SEED_ROLE_ASSIGNMENTS, SEED_MEMBER_ROLES } from '../src/patent/patentRoles.js';

export { SEED_ROLE_ASSIGNMENTS, SEED_MEMBER_ROLES };

export async function seedPatentRoles(client = supabase) {
  console.log('Seeding Patent Workflow user roles with verified UUIDs...');

  const rolesToInsert = [];
  // 1. Seed by exact verified UUIDs
  for (const [memberId, roles] of Object.entries(SEED_MEMBER_ROLES)) {
    for (const role of roles) {
      rolesToInsert.push({
        member_id: memberId,
        role
      });
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
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('seed_patent_roles.js')) {
  seedPatentRoles().then(res => {
    console.log('Seed result:', res);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal seed error:', err);
    process.exit(1);
  });
}
