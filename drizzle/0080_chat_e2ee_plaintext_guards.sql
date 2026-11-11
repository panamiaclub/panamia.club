-- Migration: 0080_chat_e2ee_plaintext_guards
-- Purpose: Permanently refuse plaintext chat writes after encrypted activation.
-- Ticket: N/A
-- Reversible: No. Removing these latches would permit plaintext downgrade.
-- Public, followers-only, Panas and ordinary group posts are not chat writes.

ALTER TABLE social_actors ADD COLUMN IF NOT EXISTS encrypted_chat_required boolean NOT NULL DEFAULT false;
ALTER TABLE social_groups ADD COLUMN IF NOT EXISTS encrypted_chat_required boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE social_actors a SET encrypted_chat_required = true
WHERE EXISTS (SELECT 1 FROM chat_e2ee_identities i WHERE i.actor_id = a.id AND i.encryption_required);
UPDATE social_groups g SET encrypted_chat_required = true
WHERE EXISTS (SELECT 1 FROM chat_e2ee_rooms r WHERE r.group_id = g.id);
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_latch_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.encryption_required THEN
    UPDATE social_actors SET encrypted_chat_required = true WHERE id = NEW.actor_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_latch_actor
AFTER INSERT OR UPDATE OF encryption_required ON chat_e2ee_identities
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_latch_actor();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_latch_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE social_groups SET encrypted_chat_required = true WHERE id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_latch_group AFTER INSERT ON chat_e2ee_rooms
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_latch_group();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_no_downgrade() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.encrypted_chat_required AND NOT NEW.encrypted_chat_required THEN
    RAISE EXCEPTION 'Encrypted chat cannot fall back to plaintext' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_actor_no_downgrade BEFORE UPDATE OF encrypted_chat_required ON social_actors
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_no_downgrade();
CREATE TRIGGER chat_e2ee_group_no_downgrade BEFORE UPDATE OF encrypted_chat_required ON social_groups
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_no_downgrade();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_refuse_plain_direct() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry record;
BEGIN
  IF NEW.group_id IS NOT NULL OR NEW.type = 'Panas' THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.recipient_to) <> 'array' OR jsonb_typeof(NEW.recipient_cc) <> 'array' THEN
    RAISE EXCEPTION 'Invalid message audience' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.recipient_to @> '["https://www.w3.org/ns/activitystreams#Public"]'::jsonb
    OR NEW.recipient_cc @> '["https://www.w3.org/ns/activitystreams#Public"]'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.recipient_to) t(value)
      WHERE t.value LIKE '%/followers%')
    OR jsonb_array_length(NEW.recipient_to) + jsonb_array_length(NEW.recipient_cc) = 0
  THEN RETURN NEW; END IF;
  FOR entry IN
    SELECT a.encrypted_chat_required FROM social_actors a
    WHERE a.id = NEW.actor_id OR a.uri IN (
      SELECT jsonb_array_elements_text(NEW.recipient_to || NEW.recipient_cc)
    ) ORDER BY a.id FOR SHARE
  LOOP
    IF entry.encrypted_chat_required THEN
      RAISE EXCEPTION 'Encrypted chat transport required' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_refuse_plain_direct
BEFORE INSERT OR UPDATE OF content, content_warning, recipient_to, recipient_cc, actor_id, group_id, type
ON social_statuses FOR EACH ROW EXECUTE FUNCTION chat_e2ee_refuse_plain_direct();
--> statement-breakpoint
CREATE FUNCTION chat_e2ee_refuse_plain_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE required boolean;
BEGIN
  SELECT encrypted_chat_required INTO required FROM social_groups WHERE id = NEW.group_id FOR SHARE;
  IF required THEN
    RAISE EXCEPTION 'Encrypted chat transport required' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_e2ee_refuse_plain_group
BEFORE INSERT OR UPDATE OF body, attachments ON social_group_chat_messages
FOR EACH ROW EXECUTE FUNCTION chat_e2ee_refuse_plain_group();
