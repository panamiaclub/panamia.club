-- Migration: 0072_profile_contact_email
-- Purpose: Let a pana's personal profile and directory listings share an inbox.
--          Contact email is not identity; users.email and profiles.user_id
--          retain their existing unique constraints.
-- Ticket: N/A
-- Reversible: Partial
-- Dependencies: profiles, users
-- Data Migration: None
-- Rollback: First resolve shared emails, then:
--   DROP INDEX profiles_listing_name_email_unique;
--   DROP INDEX profiles_email_idx;
--   ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);

ALTER TABLE "profiles" DROP CONSTRAINT "profiles_email_unique";
--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" ("email");
--> statement-breakpoint
-- Reject repeat applications for the same name and inbox, not other profiles
-- or differently named listings that happen to use the same contact address.
CREATE UNIQUE INDEX "profiles_listing_name_email_unique"
  ON "profiles" (lower("name"), lower("email"))
  WHERE "status"->>'source' = 'business_intake';
