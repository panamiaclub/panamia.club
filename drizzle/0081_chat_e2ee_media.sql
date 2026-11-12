-- Migration: 0081_chat_e2ee_media
-- Purpose: Authorize private encrypted media objects without storing names or keys.
-- Ticket: N/A
-- Reversible: No after activation; deleting ownership rows would orphan private objects.
-- Private object bytes are stored through CHAT_E2EE_BUCKET, never R2_PUBLIC_URL.

CREATE TABLE chat_e2ee_media (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES chat_e2ee_rooms(id) ON DELETE CASCADE,
  uploader_device_id text NOT NULL,
  object_key text NOT NULL UNIQUE,
  byte_length integer NOT NULL,
  sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  message_id text REFERENCES chat_e2ee_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT chat_e2ee_media_length CHECK (byte_length BETWEEN 17 AND 10485776),
  CONSTRAINT chat_e2ee_media_state CHECK (state IN ('reserved', 'stored', 'bound', 'deleting'))
);
--> statement-breakpoint
CREATE INDEX chat_e2ee_media_room_idx ON chat_e2ee_media(room_id);
CREATE INDEX chat_e2ee_media_uploader_idx ON chat_e2ee_media(uploader_device_id);
CREATE INDEX chat_e2ee_media_message_idx ON chat_e2ee_media(message_id);
CREATE INDEX chat_e2ee_media_expiry_idx ON chat_e2ee_media(expires_at);
--> statement-breakpoint
ALTER TABLE chat_e2ee_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE chat_e2ee_object_deletions (
  object_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE chat_e2ee_object_deletions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_queue_media_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chat_e2ee_object_deletions(object_key) VALUES (OLD.object_key)
  ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_queue_media_deletion AFTER DELETE ON chat_e2ee_media
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_queue_media_deletion();
