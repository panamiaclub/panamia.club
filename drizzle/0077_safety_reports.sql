-- Migration: 0077_safety_reports
-- Purpose: Triage in-app user and content safety reports in the existing private support queue.
-- Ticket: #158
-- Reversible: No. Removing a PostgreSQL enum value requires rebuilding the type.

ALTER TYPE contact_submission_category ADD VALUE IF NOT EXISTS 'safety';
