import { createClient } from '@supabase/supabase-js';

const centralUrl = process.env.SUPABASE_URL || process.env.VITE_CENTRAL_SUPABASE_URL || 'https://eafciegebhuhoneypsqy.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA5NTU1NywiZXhwIjoyMTA2NjcxNTU3fQ.rxJJ-BO6bAeJYBu-tonvwxNZ3rh1D5ugjIpQMPk4qNo';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-lextria-app');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const centralAdmin = createClient(centralUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // -------------------------------------------------------------
  // GET: List all central clients with their portal status
  // -------------------------------------------------------------
  if (req.method === 'GET') {
    try {
      // 1. Fetch clients from core.clients
      const { data: clients, error: cErr } = await centralAdmin
        .schema('core')
        .from('clients')
        .select('*')
        .order('client_name', { ascending: true });

      if (cErr) throw cErr;

      // 1b. Fetch all client logos from core.app_settings
      const logoMap = new Map();
      try {
        const { data: logoSettings } = await centralAdmin
          .schema('core')
          .from('app_settings')
          .select('key, value')
          .eq('app', 'CORE')
          .like('key', 'client_logo_%');

        if (logoSettings) {
          logoSettings.forEach((s) => {
            const cId = s.key.replace('client_logo_', '');
            const val = typeof s.value === 'string' ? s.value : (s.value?.logo_url || null);
            if (val) logoMap.set(cId, val);
          });
        }
      } catch (lErr) {
        console.warn('Could not fetch client logos from app_settings:', lErr);
      }

      // 2. Fetch auth users to see who has client portal access
      let clientAuthMap = new Map();
      try {
        const { data: authData } = await centralAdmin.auth.admin.listUsers();
        if (authData && authData.users) {
          authData.users.forEach(u => {
            const meta = u.user_metadata || {};
            if (meta.role === 'CLIENT' && meta.client_id) {
              clientAuthMap.set(meta.client_id, {
                authUserId: u.id,
                email: u.email,
                lastSignIn: u.last_sign_in_at,
                createdAt: u.created_at,
                logo_url: meta.logo_url || null,
              });
            }
          });
        }
      } catch (authErr) {
        console.warn('Could not list auth users for client portal status:', authErr);
      }

      // 3. Merge portal status and client logos onto client objects
      const enrichedClients = (clients || []).map(c => {
        const portal = clientAuthMap.get(c.id);
        const logoUrl = logoMap.get(c.id) || portal?.logo_url || null;
        return {
          ...c,
          logo_url: logoUrl,
          portalAccess: Boolean(portal),
          portalEmail: portal?.email || c.email || (c.client_code ? `${c.client_code.toLowerCase()}@client.lextria.in` : ''),
          portalUserId: portal?.authUserId || null,
          portalLastSignIn: portal?.lastSignIn || null,
        };
      });

      return res.status(200).json({ clients: enrichedClients });
    } catch (err) {
      console.error('Error fetching central clients:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // -------------------------------------------------------------
  // POST: Add new client to core.clients + Auto-create Portal
  // -------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const {
        client_code,
        client_name,
        entity_type = 'COMPANY',
        email,
        phone,
        gstin,
        pan,
        billing_address,
        state_code,
        portal_access = true, // Default to true: automatic portal creation!
        portal_email,
        portal_password,
        logo_url,
      } = req.body || {};

      if (!client_code || !client_code.trim()) {
        return res.status(400).json({ error: 'Client Code is required.' });
      }
      if (!client_name || !client_name.trim()) {
        return res.status(400).json({ error: 'Client Name is required.' });
      }

      const cleanCode = client_code.trim().toUpperCase();
      const cleanName = client_name.trim();

      // Check for code uniqueness
      const { data: existing } = await centralAdmin
        .schema('core')
        .from('clients')
        .select('id, client_code')
        .eq('client_code', cleanCode)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: `Client Code "${cleanCode}" is already in use.` });
      }

      // Insert new client into core.clients
      const { data: newClient, error: insErr } = await centralAdmin
        .schema('core')
        .from('clients')
        .insert([{
          client_code: cleanCode,
          client_name: cleanName,
          entity_type: entity_type || 'COMPANY',
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          gstin: gstin?.trim() || null,
          pan: pan?.trim() || null,
          billing_address: billing_address?.trim() || null,
          state_code: state_code?.trim() || null,
        }])
        .select()
        .single();

      if (insErr) throw insErr;

      // Save client logo to core.app_settings if provided
      if (logo_url && typeof logo_url === 'string') {
        try {
          await centralAdmin
            .schema('core')
            .from('app_settings')
            .upsert({
              app: 'CORE',
              key: `client_logo_${newClient.id}`,
              value: logo_url,
            }, { onConflict: 'app,key' });
        } catch (logoErr) {
          console.warn('Could not save client logo to app_settings:', logoErr);
        }
      }

      // Automatically provision Client Portal user if portal_access is enabled
      let portalUser = null;
      let portalError = null;

      if (portal_access !== false) {
        const portalLoginEmail = (portal_email?.trim() || email?.trim() || `${cleanCode.toLowerCase()}@client.lextria.in`).toLowerCase();
        const pass = portal_password?.trim() || `LextriaPortal!${cleanCode}2026`;

        try {
          const { data: authRes, error: aErr } = await centralAdmin.auth.admin.createUser({
            email: portalLoginEmail,
            password: pass,
            email_confirm: true,
            user_metadata: {
              role: 'CLIENT',
              client_id: newClient.id,
              client_code: cleanCode,
              client_name: cleanName,
              entity_type: entity_type || 'COMPANY',
              email: portalLoginEmail,
              phone: phone?.trim() || null,
              gstin: gstin?.trim() || null,
              pan: pan?.trim() || null,
              billing_address: billing_address?.trim() || null,
              state_code: state_code?.trim() || null,
              portal_access: true,
              logo_url: logo_url || null,
            },
          });

          if (!aErr && authRes?.user) {
            portalUser = authRes.user;
          } else if (aErr) {
            portalError = aErr.message;
            console.warn('Supabase auth create warning:', aErr.message);

            // If user already exists with this email, link and update password
            const { data: searchData } = await centralAdmin.auth.admin.listUsers();
            const existingAuth = (searchData?.users || []).find(u => u.email?.toLowerCase() === portalLoginEmail.toLowerCase());
            if (existingAuth) {
              await centralAdmin.auth.admin.updateUserById(existingAuth.id, {
                password: pass,
                user_metadata: {
                  ...existingAuth.user_metadata,
                  role: 'CLIENT',
                  client_id: newClient.id,
                  client_code: cleanCode,
                  client_name: cleanName,
                  entity_type: entity_type || 'COMPANY',
                  email: portalLoginEmail,
                  phone: phone?.trim() || null,
                  gstin: gstin?.trim() || null,
                  pan: pan?.trim() || null,
                  billing_address: billing_address?.trim() || null,
                  state_code: state_code?.trim() || null,
                  portal_access: true,
                  logo_url: logo_url || existingAuth.user_metadata?.logo_url || null,
                }
              });

              portalUser = existingAuth;
            }
          }
        } catch (authCreateErr) {
          portalError = authCreateErr.message;
          console.warn('Failed to provision client portal credentials:', authCreateErr);
        }
      }

      return res.status(201).json({
        success: true,
        client: {
          ...newClient,
          logo_url: logo_url || null,
          portalAccess: Boolean(portalUser),
          portalEmail: portalUser?.email || newClient.email || `${cleanCode.toLowerCase()}@client.lextria.in`,
          portalError: portalError || undefined,
        },
      });
    } catch (err) {
      console.error('Error creating client:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // -------------------------------------------------------------
  // PUT: Update an existing client + Edit Portal Login & Password
  // -------------------------------------------------------------
  if (req.method === 'PUT') {
    try {
      const {
        id,
        client_code,
        client_name,
        entity_type,
        email,
        phone,
        gstin,
        pan,
        billing_address,
        state_code,
        portal_access,
        portal_email,
        portal_password,
        logo_url,
      } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: 'Client ID is required.' });
      }

      const updates = {
        updated_at: new Date().toISOString(),
      };
      if (client_code) updates.client_code = client_code.trim().toUpperCase();
      if (client_name) updates.client_name = client_name.trim();
      if (entity_type) updates.entity_type = entity_type;
      if (email !== undefined) updates.email = email?.trim() || null;
      if (phone !== undefined) updates.phone = phone?.trim() || null;
      if (gstin !== undefined) updates.gstin = gstin?.trim() || null;
      if (pan !== undefined) updates.pan = pan?.trim() || null;
      if (billing_address !== undefined) updates.billing_address = billing_address?.trim() || null;
      if (state_code !== undefined) updates.state_code = state_code?.trim() || null;

      const { data: updatedClient, error: upErr } = await centralAdmin
        .schema('core')
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (upErr) throw upErr;

      // Handle logo_url update in core.app_settings
      let currentLogoUrl = undefined;
      if (logo_url !== undefined) {
        if (logo_url && typeof logo_url === 'string') {
          try {
            await centralAdmin
              .schema('core')
              .from('app_settings')
              .upsert({
                app: 'CORE',
                key: `client_logo_${id}`,
                value: logo_url,
              }, { onConflict: 'app,key' });
            currentLogoUrl = logo_url;
          } catch (logoErr) {
            console.warn('Could not save client logo to app_settings:', logoErr);
          }
        } else if (logo_url === null || logo_url === '') {
          try {
            await centralAdmin
              .schema('core')
              .from('app_settings')
              .delete()
              .eq('app', 'CORE')
              .eq('key', `client_logo_${id}`);
            currentLogoUrl = null;
          } catch (logoErr) {
            console.warn('Could not remove client logo from app_settings:', logoErr);
          }
        }
      } else {
        // Retain existing logo
        try {
          const { data: exLogo } = await centralAdmin
            .schema('core')
            .from('app_settings')
            .select('value')
            .eq('app', 'CORE')
            .eq('key', `client_logo_${id}`)
            .maybeSingle();
          if (exLogo?.value) currentLogoUrl = typeof exLogo.value === 'string' ? exLogo.value : exLogo.value?.logo_url;
        } catch (_) {}
      }

      // Handle portal access and credential changes
      let updatedPortalUser = null;
      try {
        const { data: authList } = await centralAdmin.auth.admin.listUsers();
        let existingUser = (authList?.users || []).find(
          u => u.user_metadata?.client_id === id
        );

        const targetPortalEmail = (
          portal_email?.trim() ||
          existingUser?.email ||
          updatedClient.email ||
          `${updatedClient.client_code.toLowerCase()}@client.lextria.in`
        ).toLowerCase();

        if (!existingUser && targetPortalEmail) {
          existingUser = (authList?.users || []).find(
            u => u.email?.toLowerCase() === targetPortalEmail
          );
        }

        if (portal_access) {
          if (!existingUser) {
            // Provision new portal user
            const pass = portal_password?.trim() || `LextriaPortal!${updatedClient.client_code}2026`;
            const { data: newAuth, error: newAuthErr } = await centralAdmin.auth.admin.createUser({
              email: targetPortalEmail,
              password: pass,
              email_confirm: true,
              user_metadata: {
                role: 'CLIENT',
                client_id: id,
                client_code: updatedClient.client_code,
                client_name: updatedClient.client_name,
                entity_type: updatedClient.entity_type || 'COMPANY',
                email: targetPortalEmail,
                phone: updatedClient.phone || null,
                gstin: updatedClient.gstin || null,
                pan: updatedClient.pan || null,
                billing_address: updatedClient.billing_address || null,
                state_code: updatedClient.state_code || null,
                portal_access: true,
                logo_url: currentLogoUrl || null,
              },
            });

            if (newAuth?.user) {
              updatedPortalUser = newAuth.user;
            }
          } else {
            // Update existing portal user's credentials and metadata
            const authUpdates = {
              user_metadata: {
                ...existingUser.user_metadata,
                role: 'CLIENT',
                client_id: id,
                client_code: updatedClient.client_code,
                client_name: updatedClient.client_name,
                entity_type: updatedClient.entity_type || 'COMPANY',
                email: targetPortalEmail,
                phone: updatedClient.phone || null,
                gstin: updatedClient.gstin || null,
                pan: updatedClient.pan || null,
                billing_address: updatedClient.billing_address || null,
                state_code: updatedClient.state_code || null,
                portal_access: true,
                logo_url: currentLogoUrl !== undefined ? currentLogoUrl : (existingUser.user_metadata?.logo_url || null),
              }
            };
            if (portal_password?.trim()) {
              authUpdates.password = portal_password.trim();
            }
            if (targetPortalEmail && targetPortalEmail !== existingUser.email?.toLowerCase()) {
              authUpdates.email = targetPortalEmail;
            }

            const { data: updRes } = await centralAdmin.auth.admin.updateUserById(existingUser.id, authUpdates);
            updatedPortalUser = updRes?.user || existingUser;
          }
        } else if (portal_access === false && existingUser) {
          // Deactivate / delete portal access
          await centralAdmin.auth.admin.deleteUser(existingUser.id);
          await centralAdmin
            .schema('core')
            .from('profiles')
            .delete()
            .eq('id', existingUser.id);
        }
      } catch (portalUpdateErr) {
        console.warn('Error managing client portal credentials:', portalUpdateErr);
      }

      return res.status(200).json({
        success: true,
        client: {
          ...updatedClient,
          logo_url: currentLogoUrl !== undefined ? currentLogoUrl : null,
          portalAccess: Boolean(portal_access),
          portalEmail: updatedPortalUser?.email || (portal_email?.trim() || updatedClient.email || ''),
        }
      });
    } catch (err) {
      console.error('Error updating client:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // -------------------------------------------------------------
  // DELETE: Remove client from core.clients
  // -------------------------------------------------------------
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body || req.query || {};
      if (!id) {
        return res.status(400).json({ error: 'Client ID is required.' });
      }

      // Check if client has associated project codes
      const { data: linkedCodes } = await centralAdmin
        .schema('core')
        .from('project_codes')
        .select('id')
        .eq('client_id', id)
        .limit(1);

      if (linkedCodes && linkedCodes.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete client with active matters / project codes. Please reassign or close matters first.',
        });
      }

      // Delete auth user if one exists
      try {
        const { data: authList } = await centralAdmin.auth.admin.listUsers();
        const existingUser = (authList?.users || []).find(
          u => u.user_metadata?.client_id === id
        );
        if (existingUser) {
          await centralAdmin.auth.admin.deleteUser(existingUser.id);
          await centralAdmin
            .schema('core')
            .from('profiles')
            .delete()
            .eq('id', existingUser.id);
        }
      } catch (authDelErr) {
        console.warn('Client portal auth delete warning:', authDelErr);
      }

      // Delete client logo from app_settings
      try {
        await centralAdmin
          .schema('core')
          .from('app_settings')
          .delete()
          .eq('app', 'CORE')
          .eq('key', `client_logo_${id}`);
      } catch (logoDelErr) {
        console.warn('Client logo delete warning:', logoDelErr);
      }

      const { error: delErr } = await centralAdmin
        .schema('core')
        .from('clients')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Error deleting client:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
