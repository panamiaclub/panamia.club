-- Migration: 0078_social_interaction_notifications
-- Purpose: Add in-app alerts for social likes and replies.
-- Ticket: N/A
-- Reversible: No; PostgreSQL enum labels cannot be dropped in place.

ALTER TYPE "notification_context" ADD VALUE IF NOT EXISTS 'like';
ALTER TYPE "notification_context" ADD VALUE IF NOT EXISTS 'reply';
