-- Migration: 0079_chat_reactions
-- Purpose: Private quick reactions for individual and native group messages.
-- Ticket: N/A
-- Reversible: Yes; DROP TABLE social_chat_reactions.

CREATE TABLE "social_chat_reactions" (
  "id" text PRIMARY KEY NOT NULL,
  "status_id" text REFERENCES "social_statuses"("id") ON DELETE CASCADE,
  "group_message_id" text REFERENCES "social_group_chat_messages"("id") ON DELETE CASCADE,
  "actor_id" text NOT NULL REFERENCES "social_actors"("id") ON DELETE CASCADE,
  "emoji" text NOT NULL,
  CONSTRAINT "social_chat_reactions_one_message"
    CHECK (num_nonnulls("status_id", "group_message_id") = 1),
  CONSTRAINT "social_chat_reactions_emoji"
    CHECK ("emoji" IN ('👍', '❤️', '😂', '😮', '😢', '🙏'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_chat_reactions_status_actor_idx"
  ON "social_chat_reactions" ("status_id", "actor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "social_chat_reactions_group_actor_idx"
  ON "social_chat_reactions" ("group_message_id", "actor_id");
--> statement-breakpoint
CREATE INDEX "social_chat_reactions_actor_idx" ON "social_chat_reactions" ("actor_id");
--> statement-breakpoint
ALTER TABLE "social_chat_reactions" ENABLE ROW LEVEL SECURITY;
