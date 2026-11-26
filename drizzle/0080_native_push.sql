-- Purpose: Session-bound native registrations and an atomic notification outbox.
-- Ticket: N/A - native iOS and Android push rollout.
-- Reversible: DROP TRIGGER notifications_native_push ON notifications;
-- DROP FUNCTION enqueue_native_push(); DROP TABLE push_deliveries, push_devices;
CREATE TABLE push_devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX push_devices_user_idx ON push_devices(user_id);
--> statement-breakpoint
CREATE INDEX push_devices_session_idx ON push_devices(session_id);
--> statement-breakpoint
CREATE TABLE push_deliveries (
  device_id text NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, notification_id)
);
--> statement-breakpoint
CREATE INDEX push_deliveries_due_idx ON push_deliveries(available_at);
--> statement-breakpoint
-- Atomic with the bell insert, including bulk inserts. No historical backfill.
CREATE FUNCTION enqueue_native_push() RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  INSERT INTO push_deliveries (device_id, notification_id)
    SELECT d.id, NEW.id FROM push_devices d
    JOIN sessions s ON s.id = d.session_id AND s.user_id = d.user_id
    WHERE d.user_id = NEW.target AND s.expires_at > now()
      AND d.updated_at > now() - interval '30 days'
      AND NEW.actor <> NEW.target AND NOT NEW.read;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notifications_native_push AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION enqueue_native_push();
