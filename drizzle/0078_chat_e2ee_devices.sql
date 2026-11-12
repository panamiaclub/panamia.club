-- Migration: 0078_chat_e2ee_devices
-- Purpose: Store public E2EE identities, owner-approved devices and single-use prekeys.
-- Ticket: N/A
-- Reversible: Yes, before encrypted messaging activation. Drop the new tables in reverse order.
-- Rollback: DROP TABLE chat_e2ee_request_nonces, chat_e2ee_key_packages,
--   chat_e2ee_enrollments, chat_e2ee_devices, chat_e2ee_identities;
-- No private signing keys, MLS ratchets, recovery keys or message plaintext.

CREATE TABLE "chat_e2ee_identities" (
  "profile_id" text PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "actor_id" text NOT NULL UNIQUE REFERENCES "social_actors"("id") ON DELETE CASCADE,
  "root_public_key" text NOT NULL UNIQUE,
  "root_version" integer NOT NULL DEFAULT 1,
  "encryption_required" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chat_e2ee_root_key_length" CHECK (char_length("root_public_key") = 44),
  CONSTRAINT "chat_e2ee_root_version" CHECK ("root_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "chat_e2ee_devices" (
  "id" text PRIMARY KEY,
  "profile_id" text NOT NULL REFERENCES "chat_e2ee_identities"("profile_id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "signing_key" text NOT NULL UNIQUE,
  "credential" text NOT NULL,
  "certificate" jsonb NOT NULL,
  "state_hash" text,
  "checkpoint_id" text,
  "root_version" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "ready_at" timestamptz,
  "revocation" jsonb,
  CONSTRAINT "chat_e2ee_device_key_length" CHECK (char_length("signing_key") = 44),
  CONSTRAINT "chat_e2ee_credential_length" CHECK (octet_length("credential") BETWEEN 1 AND 512)
);
--> statement-breakpoint
CREATE INDEX "chat_e2ee_devices_profile_idx" ON "chat_e2ee_devices" ("profile_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_devices_user_idx" ON "chat_e2ee_devices" ("user_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_devices_expiry_idx" ON "chat_e2ee_devices" ("expires_at");
--> statement-breakpoint
CREATE TABLE "chat_e2ee_enrollments" (
  "id" text PRIMARY KEY,
  "profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "challenge" jsonb NOT NULL,
  "proof" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "approved_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_enrollment_device_unique"
  ON "chat_e2ee_enrollments" ("profile_id", "device_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_enrollments_expiry_idx" ON "chat_e2ee_enrollments" ("expires_at");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_enrollments_user_idx" ON "chat_e2ee_enrollments" ("user_id");
--> statement-breakpoint
CREATE TABLE "chat_e2ee_key_packages" (
  "id" text PRIMARY KEY,
  "device_id" text NOT NULL REFERENCES "chat_e2ee_devices"("id") ON DELETE CASCADE,
  "bytes" text NOT NULL,
  "sha256" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "claimed_at" timestamptz,
  "claimed_room_id" text,
  "claimed_by_device_id" text,
  CONSTRAINT "chat_e2ee_key_package_length" CHECK (char_length("bytes") BETWEEN 4 AND 87384),
  CONSTRAINT "chat_e2ee_key_package_hash" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_e2ee_key_package_hash_unique" ON "chat_e2ee_key_packages" ("device_id", "sha256");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_key_packages_device_idx" ON "chat_e2ee_key_packages" ("device_id");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_key_packages_expiry_idx" ON "chat_e2ee_key_packages" ("expires_at");
--> statement-breakpoint
CREATE TABLE "chat_e2ee_request_nonces" (
  "id" text PRIMARY KEY,
  "device_id" text NOT NULL REFERENCES "chat_e2ee_devices"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_e2ee_request_nonces_expiry_idx" ON "chat_e2ee_request_nonces" ("expires_at");
--> statement-breakpoint
CREATE INDEX "chat_e2ee_request_nonces_device_idx" ON "chat_e2ee_request_nonces" ("device_id");
--> statement-breakpoint
ALTER TABLE "chat_e2ee_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_key_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_e2ee_request_nonces" ENABLE ROW LEVEL SECURITY;
