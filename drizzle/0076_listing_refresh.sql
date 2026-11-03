-- Migration: 0076_listing_refresh
-- Purpose: Persist explicit listing reviews, weekly reminders and recoverable overdue pauses.
-- Ticket: #155
-- Reversible: Yes. Drop the two new tables and the last_reviewed_at/email_opted_out columns.
-- No existing listing is enrolled, emailed, unpublished or assigned by this migration.

ALTER TABLE profiles ADD COLUMN last_reviewed_at timestamp with time zone;
ALTER TABLE profiles ADD COLUMN email_opted_out boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE listing_refresh_cycles (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued',
  reminder_count integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone,
  due_at timestamp with time zone,
  next_reminder_at timestamp with time zone,
  last_sent_at timestamp with time zone,
  completed_at timestamp with time zone,
  paused_at timestamp with time zone,
  hold_reason text,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT listing_refresh_state_valid CHECK (state IN ('queued', 'active', 'held', 'paused', 'completed', 'cancelled')),
  CONSTRAINT listing_refresh_count_valid CHECK (reminder_count BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX listing_refresh_current_unique ON listing_refresh_cycles(profile_id)
  WHERE state IN ('queued', 'active', 'held', 'paused');
CREATE INDEX listing_refresh_due_idx ON listing_refresh_cycles(state, next_reminder_at, due_at);
--> statement-breakpoint
CREATE TABLE listing_refresh_deliveries (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES listing_refresh_cycles(id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round BETWEEN 0 AND 4),
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'cancelled')),
  recipient_hash text NOT NULL,
  routing_hash text NOT NULL,
  stop_token_hash text NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone,
  error_code text
);
--> statement-breakpoint
CREATE UNIQUE INDEX listing_refresh_sending_unique ON listing_refresh_deliveries(cycle_id, round, recipient_hash) WHERE status = 'sending';
CREATE UNIQUE INDEX listing_refresh_sent_unique ON listing_refresh_deliveries(cycle_id, round, recipient_hash) WHERE status = 'sent';
CREATE INDEX listing_refresh_delivery_cycle_idx ON listing_refresh_deliveries(cycle_id);
--> statement-breakpoint
ALTER TABLE listing_refresh_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_refresh_deliveries ENABLE ROW LEVEL SECURITY;
