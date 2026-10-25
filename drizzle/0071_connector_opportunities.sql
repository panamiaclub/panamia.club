-- Migration: 0071_connector_opportunities
-- Purpose: Publish real calls for help; signups live in the existing commitments.
-- Ticket: N/A
-- Reversible: Yes
-- Data migration: None. Prototype examples are deliberately not imported.
-- Rollback: DROP INDEX connector_commitments_opportunity_profile_idx;
--           ALTER TABLE connector_commitments DROP COLUMN opportunity_id;
--           DROP TABLE connector_opportunities;

CREATE TABLE "connector_opportunities" (
  "id" text PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "title" text NOT NULL,
  "details" text NOT NULL,
  "house" text NOT NULL,
  "pod" text,
  "when_text" text,
  "location" text,
  "estimated_minutes" integer,
  "spots" integer,
  "event_id" text REFERENCES "events"("id") ON DELETE CASCADE,
  "connector_event_id" text REFERENCES "connector_events"("id") ON DELETE CASCADE,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamp with time zone,
  CONSTRAINT "connector_opportunities_title_check"
    CHECK (length(btrim("title")) BETWEEN 1 AND 150),
  CONSTRAINT "connector_opportunities_details_check"
    CHECK (length(btrim("details")) BETWEEN 1 AND 2000),
  CONSTRAINT "connector_opportunities_house_check"
    CHECK ("house" IN ('education', 'relationshipBuilding', 'narrativeShifters', 'culturalWorkers')),
  CONSTRAINT "connector_opportunities_pod_check"
    CHECK ("pod" IS NULL OR "pod" IN ('miami', 'broward', 'palmBeach')),
  CONSTRAINT "connector_opportunities_minutes_check"
    CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" BETWEEN 1 AND 6000),
  CONSTRAINT "connector_opportunities_spots_check"
    CHECK ("spots" IS NULL OR "spots" BETWEEN 1 AND 9999),
  CONSTRAINT "connector_opportunities_event_check"
    CHECK ("event_id" IS NULL OR "connector_event_id" IS NULL)
);

CREATE INDEX "connector_opportunities_open_idx"
  ON "connector_opportunities" ("closed_at", "created_at");

-- Deleting an erroneous event removes its ask, not a connector's work history.
-- Cancelling or closing an ask keeps both the ask and its commitments visible.
ALTER TABLE "connector_commitments"
  ADD COLUMN "opportunity_id" text
  REFERENCES "connector_opportunities"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "connector_commitments_opportunity_profile_idx"
  ON "connector_commitments" ("opportunity_id", "profile_id");
