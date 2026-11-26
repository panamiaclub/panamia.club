-- Migration: existing_push_message_previews
-- Purpose: Enable untouched legacy preview defaults without resetting saved opt-outs.
-- Ticket: #226 follow-up
-- Reversible: Partial
-- Rollback: Restore the column default to false; migrated choices cannot be reconstructed.
--
-- Before the first preview release merged at 2026-11-26T21:06:46Z, the
-- registration API could not save an explicit preview opt-out. Later renewals
-- and user choices share the same timestamp/boolean fields, so preserve all
-- newer off values rather than guessing their intent. Do not refresh devices.
ALTER TABLE push_devices
  ALTER COLUMN message_previews SET DEFAULT true;
--> statement-breakpoint
UPDATE push_devices
SET message_previews = true
WHERE message_previews = false
  AND updated_at < TIMESTAMPTZ '2026-11-26T21:06:46Z';
