-- Migration: 0074_social_group_chat
-- Purpose: Add native, members-only group chat with 30-day visible history.
-- Ticket: N/A
-- Reversible: Yes. Drop only the new social_group_chat_messages table.
--
-- Native member-only group chat. Group membership remains authoritative; no
-- room-members table or public/federated status is created.
-- Expiry hides messages after 30 days, like DMs. Moderation is a soft delete.
-- Deleting a group or author removes their message rows through the FK.
-- Rollback: DROP TABLE IF EXISTS social_group_chat_messages;

CREATE TABLE IF NOT EXISTS "social_group_chat_messages" (
  "id" text PRIMARY KEY,
  "group_id" text NOT NULL REFERENCES "social_groups"("id") ON DELETE CASCADE,
  "actor_id" text NOT NULL REFERENCES "social_actors"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "body" text NOT NULL,
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "deleted_at" timestamp with time zone,
  "deleted_by_actor_id" text REFERENCES "social_actors"("id") ON DELETE SET NULL,
  CONSTRAINT "social_group_chat_body_length" CHECK (char_length("body") <= 5000),
  CONSTRAINT "social_group_chat_client_length" CHECK (char_length("client_id") BETWEEN 1 AND 128),
  CONSTRAINT "social_group_chat_attachment_limit"
    CHECK (jsonb_typeof("attachments") = 'array' AND jsonb_array_length("attachments") <= 4),
  CONSTRAINT "social_group_chat_not_empty"
    CHECK (char_length(btrim("body")) > 0 OR jsonb_array_length("attachments") > 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "social_group_chat_client_unique"
  ON "social_group_chat_messages" ("group_id", "actor_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_group_chat_history_idx"
  ON "social_group_chat_messages" ("group_id", "created_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_group_chat_actor_idx"
  ON "social_group_chat_messages" ("actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_group_chat_deleted_by_idx"
  ON "social_group_chat_messages" ("deleted_by_actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_group_chat_expiry_idx"
  ON "social_group_chat_messages" ("expires_at");
--> statement-breakpoint

-- No client-facing policies: only the server's membership-gated API may read
-- this table, even when Supabase supplies default grants to its API roles.
ALTER TABLE "social_group_chat_messages" ENABLE ROW LEVEL SECURITY;
