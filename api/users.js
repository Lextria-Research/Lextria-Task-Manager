// api/users.js
// Vercel Serverless Function for Universal User Management across Lextria Ecosystem
// Connects to Lextria Central Supabase with Service Role to manage auth.users and core.profiles.

import { createClient } from '@supabase/supabase-js';

const centralUrl = process.env.SUPABASE_URL || process.env.VITE_CENTRAL_SUPABASE_URL || 'https://eafciegebhuhoneypsqy.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA5NTU1NywiZXhwIjoyMTA2NjcxNTU3fQ.rxJJ-BO6bAeJYBu-tonvwxNZ3rh1D5ugjIpQMPk4qNo';

const taskUrl = process.env.VITE_TASK_SUPABASE_URL || 'https://mvtodtakdvgepztiyjzz.supabase.co';
const taskAnonKey = process.env.VITE_TASK_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dG9kdGFrZHZnZXB6dGl5anp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjQwNjMsImV4cCI6MjA5NDg0MDA2M30.aVeNQ95WxstJzUKbdSsc7jP-ElhxaPSmD_mw6jvlR1w';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-lextria-app');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const centralAdmin = createClient(centralUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const taskClient = createClient(taskUrl, taskAnonKey);

  // -------------------------------------------------------------
  // GET: List all universal users with dashboard access
  // -------------------------------------------------------------
  if (req.method === 'GET') {
    try {
      // 1. Fetch profiles from core.profiles
      const { data: profiles, error: pErr } = await centralAdmin
        .schema('core')
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (pErr) throw pErr;

      // 2. Fetch auth users to get user_metadata and email confirmation
      const { data: authData, error: aErr } = await centralAdmin.auth.admin.listUsers();
      if (aErr) throw aErr;

      const authMap = new Map();
      (authData?.users || []).forEach(u => {
        authMap.set(u.id, u);
      });

      // 3. Fetch local task manager members for password emergency access
      let taskMembers = [];
      try {
        const { data: tmData } = await taskClient.from('members').select('*');
        taskMembers = tmData || [];
      } catch (e) {
        console.warn('Could not fetch task members:', e);
      }

      // Safeguard: Filter out any client accounts so Universal Team Members only includes internal firm staff
      const staffProfiles = (profiles || []).filter(p => {
        const authUser = authMap.get(p.id);
        const meta = authUser?.user_metadata || {};
        const appMeta = authUser?.app_metadata || {};
        const isClient =
          p.role === 'CLIENT' ||
          meta.role === 'CLIENT' ||
          appMeta.role === 'CLIENT' ||
          Boolean(meta.client_id) ||
          (p.email && p.email.toLowerCase().includes('@client.'));
        return !isClient;
      });

      const combined = staffProfiles.map(p => {
        const authUser = authMap.get(p.id);
        const meta = authUser?.user_metadata || {};
        const matchedTm = taskMembers.find(
          m => m.name && m.name.trim().toLowerCase() === (p.display_name || '').trim().toLowerCase()
        );

        return {
          id: p.id,
          email: p.email,
          displayName: p.display_name,
          role: p.role,
          department: p.department,
          designation: meta.designation || '',
          active: p.active,
          createdAt: p.created_at,
          cachedPassword: matchedTm?.password || meta.temp_password || '',
          dashboardAccess: {
            task_manager: meta.dashboard_access?.task_manager || { enabled: true, role: p.role === 'SUPER_ADMIN' ? 'leader' : 'member' },
            litigator: meta.dashboard_access?.litigator || { enabled: p.department === 'LITIGATION' || p.role === 'SUPER_ADMIN', role: p.role === 'SUPER_ADMIN' ? 'LITIGATION_HEAD' : 'ASSOCIATE' },
            soft_ip: meta.dashboard_access?.soft_ip || meta.dashboard_access?.ip_ledger || { enabled: p.department === 'IP_SOFT' || p.role === 'SUPER_ADMIN', role: p.role === 'SUPER_ADMIN' ? 'HEAD' : 'ASSOCIATE' },
            patent: meta.dashboard_access?.patent || { enabled: p.department === 'IP_PATENT' || p.role === 'SUPER_ADMIN', role: p.role === 'SUPER_ADMIN' ? 'ADMIN' : 'DRAFTER' },
            finance: meta.dashboard_access?.finance || { enabled: p.department === 'FINANCE' || p.role === 'SUPER_ADMIN', mode: p.role === 'SUPER_ADMIN' ? 'FULL' : 'NONE' },
            client_portal: meta.dashboard_access?.client_portal || { enabled: false, clientId: null },
          },
        };
      });

      return res.status(200).json({ users: combined });
    } catch (err) {
      console.error('List universal users error:', err);
      return res.status(500).json({ error: err.message || 'Failed to list universal users' });
    }
  }

  // -------------------------------------------------------------
  // POST: Create or Update Universal User
  // -------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const {
        userId,
        email,
        password,
        displayName,
        role = 'STAFF',
        department = 'MANAGEMENT',
        designation = '',
        dashboardAccess = {},
      } = req.body || {};

      if (!email || !displayName) {
        return res.status(400).json({ error: 'Email and Full Name are required.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = displayName.trim();
      const cleanPassword = password ? password.trim() : null;

      // Barrier: Client accounts must not be created or edited via Universal Team Members
      if (role === 'CLIENT' || cleanEmail.includes('@client.') || dashboardAccess?.client_portal?.enabled) {
        return res.status(400).json({
          error: 'Client accounts must be managed through Settings -> Clients Directory, not Universal Team Members.'
        });
      }

      let targetUserId = userId;

      // 1. Check if auth user exists
      if (!targetUserId) {
        const { data: userList } = await centralAdmin.auth.admin.listUsers();
        const existing = (userList?.users || []).find(u => u.email?.toLowerCase() === cleanEmail);
        if (existing) {
          targetUserId = existing.id;
        }
      }

      const userMetadata = {
        display_name: cleanName,
        department,
        designation,
        dashboard_access: dashboardAccess,
        temp_password: cleanPassword, // Stored securely for emergency leader password retrieval
      };

      if (!targetUserId) {
        if (!cleanPassword) {
          return res.status(400).json({ error: 'Password is required when creating a new user.' });
        }

        const { data: newUser, error: createErr } = await centralAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: cleanPassword,
          email_confirm: true,
          user_metadata: userMetadata,
        });

        if (createErr) throw createErr;
        targetUserId = newUser.user.id;
      } else {
        const updatePayload = {
          email: cleanEmail,
          user_metadata: userMetadata,
        };
        if (cleanPassword) {
          updatePayload.password = cleanPassword;
        }

        const { error: updateAuthErr } = await centralAdmin.auth.admin.updateUserById(targetUserId, updatePayload);
        if (updateAuthErr) throw updateAuthErr;
      }

      // 2. Upsert into core.profiles on central Supabase
      const isFinanceLead = dashboardAccess?.finance?.mode === 'FULL' || role === 'SUPER_ADMIN';
      const coreRole = role || (dashboardAccess?.finance?.mode === 'EXECUTIVE' ? 'OFFICE_EXEC' : 'STAFF');

      const CANONICAL_DEPT_MAP = {
        'Trademark': 'IP_SOFT',
        'Soft IP': 'IP_SOFT',
        'IP_SOFT': 'IP_SOFT',
        'Patent': 'IP_PATENT',
        'IP_PATENT': 'IP_PATENT',
        'Litigation': 'LITIGATION',
        'LITIGATION': 'LITIGATION',
        'Finance': 'FINANCE',
        'FINANCE': 'FINANCE',
        'General Management': 'MANAGEMENT',
        'MANAGEMENT': 'MANAGEMENT',
        'General': 'MANAGEMENT',
        'Corporate': 'MANAGEMENT',
        'Compliance': 'OFFICE',
        'Office': 'OFFICE',
        'OFFICE': 'OFFICE',
      };
      const rawDept = (department || '').trim();
      let canonicalDept = CANONICAL_DEPT_MAP[rawDept] || CANONICAL_DEPT_MAP[rawDept.toUpperCase()];
      const ALLOWED_DEPTS = ['MANAGEMENT', 'FINANCE', 'LITIGATION', 'OFFICE', 'IP_PATENT', 'IP_SOFT'];
      if (!canonicalDept || !ALLOWED_DEPTS.includes(canonicalDept)) {
        canonicalDept = 'MANAGEMENT';
      }

      const { data: profile, error: profErr } = await centralAdmin
        .schema('core')
        .from('profiles')
        .upsert({
          id: targetUserId,
          email: cleanEmail,
          display_name: cleanName,
          role: coreRole,
          department: canonicalDept,
          is_finance_lead: isFinanceLead,
          active: true,
        })
        .select()
        .single();

      if (profErr) throw profErr;

      // 3. Keep Task Manager members table synchronized for task assignment
      try {
        const tmRole = dashboardAccess?.task_manager?.role || (role === 'SUPER_ADMIN' ? 'leader' : 'member');
        const { data: existingTm } = await taskClient
          .from('members')
          .select('id')
          .ilike('name', cleanName)
          .maybeSingle();

        if (existingTm) {
          await taskClient.from('members').update({
            name: cleanName,
            role: tmRole,
            ...(cleanPassword ? { password: cleanPassword } : {}),
          }).eq('id', existingTm.id);
        } else {
          await taskClient.from('members').insert([{
            name: cleanName,
            role: tmRole,
            password: cleanPassword || '334',
          }]);
        }
      } catch (tmErr) {
        console.warn('Sync to task members non-critical warning:', tmErr);
      }

      return res.status(200).json({
        success: true,
        user: {
          id: targetUserId,
          email: cleanEmail,
          displayName: cleanName,
          role: coreRole,
          department,
          designation,
          dashboardAccess,
        },
      });
    } catch (err) {
      console.error('Provision universal user error:', err);
      return res.status(500).json({ error: err.message || 'Failed to provision universal user' });
    }
  }

  // -------------------------------------------------------------
  // DELETE: Deactivate / Remove Universal User
  // -------------------------------------------------------------
  if (req.method === 'DELETE') {
    try {
      const { userId, displayName } = req.body || req.query || {};
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Check if trying to delete last super admin
      const { data: profile } = await centralAdmin
        .schema('core')
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.role === 'SUPER_ADMIN') {
        const { count } = await centralAdmin
          .schema('core')
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'SUPER_ADMIN')
          .eq('active', true);

        if (count && count <= 1) {
          return res.status(400).json({ error: 'Cannot delete the only remaining Super Admin.' });
        }
      }

      // Soft delete: mark active = false in core.profiles
      await centralAdmin
        .schema('core')
        .from('profiles')
        .update({ active: false })
        .eq('id', userId);

      // Also clean up or flag in task members if display name provided
      if (displayName) {
        try {
          await taskClient.from('members').delete().ilike('name', displayName);
        } catch {}
      }

      return res.status(200).json({ success: true, message: 'User deactivated successfully.' });
    } catch (err) {
      console.error('Delete user error:', err);
      return res.status(500).json({ error: err.message || 'Failed to remove user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

