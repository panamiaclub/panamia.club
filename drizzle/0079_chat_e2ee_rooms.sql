-- Migration: 0079_chat_e2ee_rooms
-- Purpose: Add ordered ciphertext rooms and atomically freeze stale membership.
-- Ticket: N/A
-- Reversible: No after activation; removing the guards would permit plaintext downgrade.
-- No message bodies, filenames, media keys or recovery secrets are stored here.

CREATE TABLE "chat_e2ee_rooms" (
  "id" text PRIMARY KEY,
  "crypto_group_id" text NOT NULL,
  "kind" text NOT NULL,
  "group_id" text UNIQUE REFERENCES "social_groups"("id") ON DELETE CASCADE,
  "pair_key" text UNIQUE,
  "founder_device_id" text NOT NULL,
  "state" text NOT NULL DEFAULT 'initializing',
  "epoch" text NOT NULL DEFAULT '0',
  "revision" integer NOT NULL DEFAULT 0,
  "sequence" integer NOT NULL DEFAULT 0,
  "roster" jsonb NOT NULL,
  "roster_digest" text NOT NULL,
  "bootstrap_expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  CONSTRAINT "chat_e2ee_room_epoch" CHECK ("epoch" ~ '^(0|[1-9][0-9]{0,19})$'),
  CONSTRAINT "chat_e2ee_room_kind" CHECK ("kind" IN ('dm', 'group')),
  CONSTRAINT "chat_e2ee_room_state" CHECK ("state" IN ('initializing', 'active', 'rekey_required', 'closed')),
  CONSTRAINT "chat_e2ee_room_scope" CHECK (
    ("kind" = 'dm' AND "pair_key" IS NOT NULL AND "group_id" IS NULL) OR
    ("kind" = 'group' AND "group_id" IS NOT NULL AND "pair_key" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX "chat_e2ee_rooms_group_idx" ON "chat_e2ee_rooms" ("group_id");
--> statement-breakpoint
CREATE TABLE "chat_e2ee_dm_participants" (
  "id" text PRIMARY KEY,
  "room_id" text NOT NULL REFERENCES "chat_e2ee_rooms"("id") ON DELETE CASCADE,
  "actor_id" text NOT NULL REFERENCES "social_actors"("id") ON DELETE CASCADE,
  "profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "hidden_before_sequence" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_dm_participant_unique" ON "chat_e2ee_dm_participants" ("room_id", "actor_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_dm_participants_actor_idx" ON "chat_e2ee_dm_participants" ("actor_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_dm_participants_profile_idx" ON "chat_e2ee_dm_participants" ("profile_id");
--> statement-breakpoint
CREATE TABLE "chat_e2ee_events" (
  "id" text PRIMARY KEY,
  "room_id" text NOT NULL REFERENCES "chat_e2ee_rooms"("id") ON DELETE CASCADE,
  "crypto_group_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "epoch" text NOT NULL,
  "revision" integer NOT NULL,
  "client_id" text NOT NULL,
  "kind" text NOT NULL,
  "sender_device_id" text NOT NULL,
  "sender_actor_id" text NOT NULL,
  "frame" text,
  "frame_sha256" text NOT NULL,
  "envelope_sha256" text NOT NULL,
  "intent" jsonb,
  "next_roster" jsonb,
  "media_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  "deleted_at" timestamptz,
  CONSTRAINT "chat_e2ee_event_frame_length" CHECK (char_length("frame") BETWEEN 4 AND 1398104),
  CONSTRAINT "chat_e2ee_event_kind" CHECK ("kind" IN ('message', 'commit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_events_order_unique" ON "chat_e2ee_events" ("room_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_events_client_unique" ON "chat_e2ee_events" ("room_id", "sender_device_id", "client_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_events_expiry_idx" ON "chat_e2ee_events" ("expires_at");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_events_sender_idx" ON "chat_e2ee_events" ("sender_actor_id");
--> statement-breakpoint
CREATE TABLE "chat_e2ee_welcomes" (
  "id" text PRIMARY KEY,
  "room_id" text NOT NULL REFERENCES "chat_e2ee_rooms"("id") ON DELETE CASCADE,
  "crypto_group_id" text NOT NULL,
  "event_id" text NOT NULL REFERENCES "chat_e2ee_events"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "key_package_id" text NOT NULL,
  "joined_sequence" integer NOT NULL,
  "frame" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_e2ee_welcomes_target_idx" ON "chat_e2ee_welcomes" ("device_id", "room_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_welcomes_event_device_unique" ON "chat_e2ee_welcomes" ("event_id", "device_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_welcomes_package_unique" ON "chat_e2ee_welcomes" ("key_package_id");
--> statement-breakpoint
ALTER TABLE "chat_e2ee_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_dm_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_welcomes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE FUNCTION chat_e2ee_freeze_profile(target_profile text) RETURNS void
LANGUAGE sql AS $$
  UPDATE chat_e2ee_rooms r
  SET state = 'rekey_required', revision = revision + 1, updated_at = now()
  WHERE r.state <> 'closed' AND (
    r.roster @> jsonb_build_array(jsonb_build_object('profileId', target_profile))
    OR EXISTS (SELECT 1 FROM chat_e2ee_dm_participants p
      WHERE p.room_id = r.id AND p.profile_id = target_profile)
  );
$$;
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_device_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM chat_e2ee_freeze_profile(OLD.profile_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.ready_at IS NOT NULL THEN
      PERFORM chat_e2ee_freeze_profile(NEW.profile_id);
    END IF;
  ELSIF NEW.ready_at IS DISTINCT FROM OLD.ready_at
    OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.root_version IS DISTINCT FROM OLD.root_version THEN
    PERFORM chat_e2ee_freeze_profile(NEW.profile_id);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_device_changed
AFTER INSERT OR UPDATE OR DELETE ON chat_e2ee_devices
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_device_changed();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_group_membership_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected text;
BEGIN
  IF TG_OP = 'DELETE' THEN affected := OLD.group_id;
  ELSE affected := NEW.group_id;
  END IF;
  UPDATE chat_e2ee_rooms SET state = 'rekey_required',
    revision = revision + 1, updated_at = now()
  WHERE group_id = affected AND state <> 'closed';
  IF TG_OP = 'DELETE' THEN RETURN OLD;
  ELSE RETURN NEW;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_group_membership_changed
AFTER INSERT OR UPDATE OR DELETE ON social_group_members
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_group_membership_changed();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_profile_grant_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = OLD.profile_id AND p.user_id = OLD.user_id
  ) THEN
    UPDATE chat_e2ee_devices SET revoked_at = COALESCE(revoked_at, now())
    WHERE profile_id = OLD.profile_id AND user_id = OLD.user_id;
  END IF;
  PERFORM chat_e2ee_freeze_profile(OLD.profile_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD;
  ELSE RETURN NEW;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_profile_grant_changed
AFTER UPDATE OR DELETE ON profile_owners
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_profile_grant_changed();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_block_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE blocker text; blocked text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.kind <> 'block' THEN RETURN OLD; END IF;
    blocker := OLD.actor_id; blocked := OLD.target_actor_id;
  ELSE
    IF NEW.kind <> 'block' THEN RETURN NEW; END IF;
    blocker := NEW.actor_id; blocked := NEW.target_actor_id;
  END IF;
  UPDATE chat_e2ee_rooms r SET state = 'rekey_required',
    revision = revision + 1, updated_at = now()
  WHERE r.kind = 'dm' AND r.state <> 'closed'
    AND EXISTS (SELECT 1 FROM chat_e2ee_dm_participants p WHERE p.room_id = r.id AND p.actor_id = blocker)
    AND EXISTS (SELECT 1 FROM chat_e2ee_dm_participants p WHERE p.room_id = r.id AND p.actor_id = blocked);
  IF TG_OP = 'DELETE' THEN RETURN OLD;
  ELSE RETURN NEW;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_block_changed
AFTER INSERT OR UPDATE OR DELETE ON social_blocks
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_block_changed();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_request_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'pending' THEN
    UPDATE chat_e2ee_dm_participants p
    SET hidden_before_sequence = GREATEST(p.hidden_before_sequence, r.sequence + 1)
    FROM chat_e2ee_rooms r
    WHERE p.room_id = r.id AND p.actor_id = OLD.recipient_actor_id
      AND EXISTS (SELECT 1 FROM chat_e2ee_dm_participants other
        WHERE other.room_id = r.id AND other.actor_id = OLD.sender_actor_id);
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_request_deleted
AFTER DELETE ON social_dm_requests
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_request_deleted();
