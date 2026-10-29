-- =========================================================================
-- LEXTRIA PATENT NOTIFICATIONS: DATABASE SCHEMA & MIGRATION SCRIPT
-- =========================================================================
-- This script creates the relational schema for the Patent Notification System:
-- 1. patent_notifications: Stores in-app alerts and notifications
-- =========================================================================

CREATE TABLE IF NOT EXISTS patent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  filing_id uuid REFERENCES patent_filings(id) ON DELETE CASCADE,
  code text NOT NULL,
  type text NOT NULL, -- 'ASSIGNMENT_ASSIGNEE', 'ASSIGNMENT_AUDITOR', 'REASSIGNED'
  role_type text NOT NULL DEFAULT 'filer', -- 'filer' | 'auditor' | 'reassigned'
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast queries and unread counts
CREATE INDEX IF NOT EXISTS idx_patent_notifs_recipient ON patent_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_patent_notifs_created ON patent_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patent_notifs_filing ON patent_notifications(filing_id);
CREATE INDEX IF NOT EXISTS idx_patent_notifs_unread ON patent_notifications(recipient_id, read) WHERE read = false;

