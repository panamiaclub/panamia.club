-- Migration: push_message_previews
-- Purpose: Persist each installation's explicit message-preview preference.
-- Ticket: #226
-- Reversible: Partial
-- Rollback: Restore generic-only code, then drop push_devices.message_previews.
-- Rollback discards stored server-side preview choices.
--
-- Existing and old-client registrations retain their generic-only disclosure.
-- Newly enabled clients explicitly send their default-on preview preference.
ALTER TABLE push_devices
  ADD COLUMN message_previews boolean NOT NULL DEFAULT false;
