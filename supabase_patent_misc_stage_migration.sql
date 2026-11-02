-- ==============================================================================
-- SUPABASE MIGRATION: Add MISC stage support to patent_filings status check
-- ==============================================================================

-- 1. Drop existing status check constraint on patent_filings
ALTER TABLE patent_filings 
DROP CONSTRAINT IF EXISTS patent_filings_status_check;

-- 2. Add updated status check constraint including 'MISC'
ALTER TABLE patent_filings 
ADD CONSTRAINT patent_filings_status_check 
CHECK (status IN ('ASSIGNED', 'FILING', 'AUDIT', 'CORRECTION', 'PAYMENT', 'ACK', 'CLOSED', 'MISC'));

-- 3. Add index on filing_type if not exists
CREATE INDEX IF NOT EXISTS idx_patent_filings_type 
ON patent_filings(filing_type);
