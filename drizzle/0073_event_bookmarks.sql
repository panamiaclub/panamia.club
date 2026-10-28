-- Purpose: Persist private, active-profile bookmarks separately from event RSVPs.
-- Ticket: N/A - approved native mobile app rollout.
-- Reversible: Yes - DROP TABLE event_bookmarks; this removes saved-event preferences.
CREATE TABLE event_bookmarks (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX event_bookmarks_profile_event_unique
  ON event_bookmarks(profile_id, event_id);
--> statement-breakpoint
CREATE INDEX event_bookmarks_profile_created_idx
  ON event_bookmarks(profile_id, created_at);
