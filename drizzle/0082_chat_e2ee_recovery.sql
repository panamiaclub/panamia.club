-- Migration: 0082_chat_e2ee_recovery
-- Purpose: Store opaque owner/user recovery backups and bounded retained-media grants.
-- Ticket: N/A
-- Reversible: No after activation; these are users' only recovery copies.
-- The personal recovery key and profile private key are never server fields.

CREATE TABLE chat_e2ee_backups (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  uploader_device_id text NOT NULL,
  root_version integer NOT NULL,
  kind text NOT NULL,
  slot text NOT NULL,
  room_id text REFERENCES chat_e2ee_rooms(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  byte_length integer NOT NULL,
  sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT chat_e2ee_backup_kind CHECK (kind IN ('identity', 'history')),
  CONSTRAINT chat_e2ee_backup_state CHECK (state IN ('reserved', 'stored'))
);
--> statement-breakpoint
CREATE INDEX chat_e2ee_backups_owner_idx ON chat_e2ee_backups(user_id, profile_id);
CREATE INDEX chat_e2ee_backups_slot_idx ON chat_e2ee_backups(user_id, profile_id, slot);
CREATE INDEX chat_e2ee_backups_room_idx ON chat_e2ee_backups(room_id);
CREATE INDEX chat_e2ee_backups_expiry_idx ON chat_e2ee_backups(expires_at);
--> statement-breakpoint
CREATE TABLE chat_e2ee_backup_media (
  id text PRIMARY KEY,
  backup_id text NOT NULL REFERENCES chat_e2ee_backups(id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES chat_e2ee_media(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX chat_e2ee_backup_media_unique ON chat_e2ee_backup_media(backup_id, media_id);
CREATE INDEX chat_e2ee_backup_media_media_idx ON chat_e2ee_backup_media(media_id);
--> statement-breakpoint
ALTER TABLE chat_e2ee_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_e2ee_backup_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_queue_backup_deletion AFTER DELETE ON chat_e2ee_backups
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_queue_media_deletion();
