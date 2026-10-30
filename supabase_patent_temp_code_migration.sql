-- ==============================================================================
-- SUPABASE MIGRATION: Add temp_code column to patent_filings and ensure Nikhil role
-- ==============================================================================

-- 1. Add temp_code column to patent_filings table if it doesn't already exist
ALTER TABLE patent_filings 
ADD COLUMN IF NOT EXISTS temp_code text;

-- 2. Create index on temp_code for quick lookup
CREATE INDEX IF NOT EXISTS idx_patent_filings_temp_code 
ON patent_filings(temp_code);

-- 3. Ensure Nikhil is assigned the ASSIGNEE role in patent_user_roles
-- Canonical member ID for Nikhil: 802e6882-8cf0-4eb7-9cd1-6fdd235a98ad
INSERT INTO patent_user_roles (member_id, role)
SELECT '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad', 'ASSIGNEE'
WHERE NOT EXISTS (
  SELECT 1 FROM patent_user_roles 
  WHERE member_id = '802e6882-8cf0-4eb7-9cd1-6fdd235a98ad' AND role = 'ASSIGNEE'
);
