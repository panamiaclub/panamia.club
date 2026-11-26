-- Existing and old-client registrations retain their generic-only disclosure.
-- Newly enabled clients explicitly send their default-on preview preference.
ALTER TABLE push_devices
  ADD COLUMN message_previews boolean NOT NULL DEFAULT false;
