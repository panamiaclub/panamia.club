-- Migration: 0067_bug_report_context
-- Purpose: Keep the optional screenshot and browser context submitted through
--          the app-wide bug report dialog on the existing private support row.
-- Ticket: N/A
-- Reversible: Yes

ALTER TABLE "contact_submissions"
  ADD COLUMN IF NOT EXISTS "page_url" text,
  ADD COLUMN IF NOT EXISTS "screenshot_url" text,
  ADD COLUMN IF NOT EXISTS "user_agent" text,
  ADD COLUMN IF NOT EXISTS "viewport" text;

-- Rollback:
-- ALTER TABLE "contact_submissions"
--   DROP COLUMN IF EXISTS "viewport",
--   DROP COLUMN IF EXISTS "user_agent",
--   DROP COLUMN IF EXISTS "screenshot_url",
--   DROP COLUMN IF EXISTS "page_url";
