-- =========================================================================
-- LEXTRIA PATENT FILING WORKFLOW: DATABASE SCHEMA & MIGRATION SCRIPT
-- =========================================================================
-- This script creates the relational schema for the Patent Filing Workflow:
-- 1. patent_user_roles: Data-driven role memberships (SUPER_ADMIN, ASSIGNEE, AUDITOR, ACK_CHECKER)
-- 2. patent_settings: Configurable working schedule, holidays, filing types, and capacity
-- 3. patent_filings: Core filings ("codes") with optimistic concurrency locking (version)
-- 4. patent_filing_events: Immutable append-only audit trail
-- 5. patent_correction_rounds: Versioned correction rounds with image attachments and history
-- 6. Initial Seed: Links existing team members to default module roles
-- =========================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================
-- 1. USER ROLES FOR PATENT MODULE (DATA-DRIVEN)
-- ==========================================================
CREATE TABLE IF NOT EXISTS patent_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ASSIGNEE', 'AUDITOR', 'ACK_CHECKER')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(member_id, role)
);

CREATE INDEX IF NOT EXISTS idx_patent_roles_member ON patent_user_roles(member_id);
CREATE INDEX IF NOT EXISTS idx_patent_roles_role ON patent_user_roles(role);

-- ==========================================================
-- 2. MODULE SETTINGS & WORKING HOURS CONFIGURATION
-- ==========================================================
CREATE TABLE IF NOT EXISTS patent_settings (
  id text PRIMARY KEY DEFAULT 'default',
  filing_types jsonb NOT NULL DEFAULT '["Provisional", "Non-Provisional", "PCT", "Design", "Convention", "National Phase"]'::jsonb,
  work_schedule jsonb NOT NULL DEFAULT '{
    "work_days": [1, 2, 3, 4, 5, 6],
    "start_time": "09:30",
    "end_time": "18:30",
    "timezone": "Asia/Kolkata",
    "daily_capacity_minutes": 480
  }'::jsonb,
  holidays jsonb NOT NULL DEFAULT '[]'::jsonb,
  load_thresholds jsonb NOT NULL DEFAULT '{
    "free_max_hours": 8,
    "moderate_max_hours": 24
  }'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Ensure default settings row exists
INSERT INTO patent_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- ==========================================================
-- 3. PATENT FILINGS (CODES)
-- ==========================================================
CREATE TABLE IF NOT EXISTS patent_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  code text UNIQUE NOT NULL,
  filing_type text NOT NULL,
  title text,
  assignee_id uuid REFERENCES members(id) NOT NULL,
  auditor_id uuid REFERENCES members(id) NOT NULL,
  est_filing_minutes integer NOT NULL DEFAULT 0,
  est_audit_minutes integer NOT NULL DEFAULT 0,
  hard_deadline date,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'FILING', 'AUDIT', 'CORRECTION', 'PAYMENT', 'ACK', 'CLOSED')),
  correction_count integer NOT NULL DEFAULT 0,
  payment_reference text,
  payment_confirmed_by uuid REFERENCES members(id),
  payment_confirmed_at timestamptz,
  ack_confirmed_by uuid REFERENCES members(id),
  ack_confirmed_at timestamptz,
  created_by uuid REFERENCES members(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_assignee_not_auditor CHECK (assignee_id <> auditor_id)
);

CREATE INDEX IF NOT EXISTS idx_patent_filings_status ON patent_filings(status);
CREATE INDEX IF NOT EXISTS idx_patent_filings_assignee ON patent_filings(assignee_id);
CREATE INDEX IF NOT EXISTS idx_patent_filings_auditor ON patent_filings(auditor_id);
CREATE INDEX IF NOT EXISTS idx_patent_filings_code ON patent_filings(code);
CREATE INDEX IF NOT EXISTS idx_patent_filings_deadline ON patent_filings(hard_deadline);

-- ==========================================================
-- 4. FILING EVENTS (APPEND-ONLY AUDIT TRAIL)
-- ==========================================================
CREATE TABLE IF NOT EXISTS patent_filing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid REFERENCES patent_filings(id) ON DELETE CASCADE NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid REFERENCES members(id) NOT NULL,
  timestamp timestamptz DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_patent_events_filing ON patent_filing_events(filing_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_patent_events_actor ON patent_filing_events(actor_id);

-- ==========================================================
-- 5. CORRECTION ROUNDS
-- ==========================================================
CREATE TABLE IF NOT EXISTS patent_correction_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid REFERENCES patent_filings(id) ON DELETE CASCADE NOT NULL,
  round_no integer NOT NULL,
  auditor_id uuid REFERENCES members(id) NOT NULL,
  description text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  resolved_by uuid REFERENCES members(id),
  resolved_at timestamptz,
  assignee_response text,
  UNIQUE(filing_id, round_no)
);

CREATE INDEX IF NOT EXISTS idx_patent_rounds_filing ON patent_correction_rounds(filing_id);

-- ==========================================================
-- 6. SEED INITIAL ROLES BASED ON EXACT USER UUIDs
-- ==========================================================
-- Super Admin: Mounisha (42a71f9a-7119-457c-8092-0d5b75ce3060)
INSERT INTO patent_user_roles (member_id, role)
VALUES ('42a71f9a-7119-457c-8092-0d5b75ce3060', 'SUPER_ADMIN')
ON CONFLICT (member_id, role) DO NOTHING;

-- Assignees: Prashanth, Akshay, Karthik, Chaitra, Kaushal, Prathvi
INSERT INTO patent_user_roles (member_id, role) VALUES
  ('f7fe55e4-7c00-4030-86ed-0ccf39737074', 'ASSIGNEE'), -- Prashanth
  ('396ee572-3f3b-47cc-8b11-d710cc8ed4bc', 'ASSIGNEE'), -- Akshay
  ('a6ecc962-3946-41ea-9946-1ff6dcc08133', 'ASSIGNEE'), -- Karthik
  ('b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', 'ASSIGNEE'), -- Chaitra
  ('0a11ce02-42df-4007-b8a7-afcb4b9efe2c', 'ASSIGNEE'), -- Kaushal
  ('8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', 'ASSIGNEE')  -- Prathvi
ON CONFLICT (member_id, role) DO NOTHING;

-- Auditors: Prathvi, Chaitra, Kaushal, Karthik
INSERT INTO patent_user_roles (member_id, role) VALUES
  ('8eeb4375-25d3-4c3d-844c-7dd455e3c2e8', 'AUDITOR'), -- Prathvi
  ('b89a8fa8-4b89-4f11-bd54-787aeb0fa80d', 'AUDITOR'), -- Chaitra
  ('0a11ce02-42df-4007-b8a7-afcb4b9efe2c', 'AUDITOR'), -- Kaushal
  ('a6ecc962-3946-41ea-9946-1ff6dcc08133', 'AUDITOR')  -- Karthik
ON CONFLICT (member_id, role) DO NOTHING;

-- Ack Checker: Prashanth
INSERT INTO patent_user_roles (member_id, role)
VALUES ('f7fe55e4-7c00-4030-86ed-0ccf39737074', 'ACK_CHECKER')
ON CONFLICT (member_id, role) DO NOTHING;
