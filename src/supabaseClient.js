import { createClient } from '@supabase/supabase-js';

// Safe environment variable retriever for both Vite and Node test environments
const getEnv = (key, fallback = '') => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  return fallback;
};

// Central Supabase (Unified Auth, core.profiles, core.clients, core.project_codes, core.matter_events)
const centralUrl = getEnv(
  'VITE_CENTRAL_SUPABASE_URL',
  getEnv('SUPABASE_URL', 'https://eafciegebhuhoneypsqy.supabase.co')
);

const centralAnonKey = getEnv(
  'VITE_CENTRAL_SUPABASE_ANON_KEY',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwOTU1NTcsImV4cCI6MjEwNjY3MTU1N30.u1pqpPamztil2qaTaY7EahBaiWduVaQ3Wgu2_9CdJlg'
);

export const centralSupabase = createClient(centralUrl, centralAnonKey, {
  auth: {
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-lextria-app': 'TASK_MANAGER',
    },
  },
});

export const coreDb = centralSupabase.schema('core');

// Task Manager Operational Database (Tasks, Boards, Departments, Agents, Members)
const taskSupabaseUrl = getEnv(
  'VITE_TASK_SUPABASE_URL',
  'https://mvtodtakdvgepztiyjzz.supabase.co'
);

const taskSupabaseKey = getEnv(
  'VITE_TASK_SUPABASE_ANON_KEY',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dG9kdGFrZHZnZXB6dGl5anp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjQwNjMsImV4cCI6MjA5NDg0MDA2M30.aVeNQ95WxstJzUKbdSsc7jP-ElhxaPSmD_mw6jvlR1w'
);

export const taskSupabase = createClient(taskSupabaseUrl, taskSupabaseKey);

// Default export alias to guarantee 100% backward compatibility for all existing task queries
export const supabase = taskSupabase;

export default supabase;
