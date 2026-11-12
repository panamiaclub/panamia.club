-- Migration: 0083_chat_e2ee_lifecycle
-- Purpose: Freeze owner-authority changes and remove deleted authors' retained ciphertext.
-- Ticket: N/A
-- Reversible: No; transport latches and visible identity changes must not be rolled back.

ALTER TABLE chat_e2ee_identities
  ADD COLUMN rotation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN last_reset_id text,
  ADD COLUMN last_reset_at timestamptz;
ALTER TABLE chat_e2ee_rooms ADD COLUMN restart jsonb;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION chat_e2ee_profile_grant_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE loses_access boolean; loses_owner boolean;
BEGIN
  loses_access := TG_OP = 'DELETE';
  loses_owner := OLD.role = 'owner';
  IF TG_OP = 'UPDATE' THEN
    loses_access := OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.profile_id IS DISTINCT FROM NEW.profile_id;
    loses_owner := loses_owner AND (loses_access OR NEW.role <> 'owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = OLD.profile_id AND p.user_id = OLD.user_id) THEN
    IF loses_access OR loses_owner THEN
      UPDATE chat_e2ee_devices SET revoked_at = COALESCE(revoked_at, now())
      WHERE profile_id = OLD.profile_id AND user_id = OLD.user_id;
    END IF;
    IF loses_owner THEN
      UPDATE chat_e2ee_identities SET rotation_required = true, updated_at = now()
      WHERE profile_id = OLD.profile_id;
    END IF;
  END IF;
  PERFORM chat_e2ee_freeze_profile(OLD.profile_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_personal_owner_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id AND OLD.user_id IS NOT NULL THEN
    UPDATE chat_e2ee_devices SET revoked_at = COALESCE(revoked_at, now())
    WHERE profile_id = OLD.id AND user_id = OLD.user_id;
    UPDATE chat_e2ee_identities SET rotation_required = true, updated_at = now() WHERE profile_id = OLD.id;
    PERFORM chat_e2ee_freeze_profile(OLD.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chat_e2ee_personal_owner_changed AFTER UPDATE OF user_id ON profiles
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_personal_owner_changed();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_author_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_e2ee_events SET frame = NULL, deleted_at = COALESCE(deleted_at, now())
  WHERE sender_actor_id = OLD.id AND kind = 'message';
  UPDATE chat_e2ee_media m SET expires_at = LEAST(expires_at, now())
  WHERE EXISTS (SELECT 1 FROM chat_e2ee_events e WHERE e.id = m.message_id AND e.sender_actor_id = OLD.id);
  UPDATE chat_e2ee_rooms r SET state = 'closed', closed_at = now(), revision = revision + 1
  WHERE r.kind = 'dm' AND EXISTS (
    SELECT 1 FROM chat_e2ee_dm_participants p WHERE p.room_id = r.id AND p.actor_id = OLD.id
  );
  RETURN OLD;
END;
$$;
CREATE TRIGGER chat_e2ee_author_deleted BEFORE DELETE ON social_actors
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_author_deleted();
--> statement-breakpoint
ALTER TABLE chat_e2ee_events ADD CONSTRAINT chat_e2ee_control_frame_retained
CHECK (kind <> 'commit' OR frame IS NOT NULL);
