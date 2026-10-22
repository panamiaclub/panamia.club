export const REFERRAL_COOKIE = 'pana_referral_attribution';
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
const REFERRAL_ATTRIBUTION_PATTERN = /^[A-Za-z0-9_-]{16,48}$/;

export const REFERRAL_EVENT_TYPES = [
  'account_created',
  'directory_submitted',
  'connector_active',
] as const;

export type ReferralEventType = (typeof REFERRAL_EVENT_TYPES)[number];

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function normalizeReferralAttributionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return REFERRAL_ATTRIBUTION_PATTERN.test(id) ? id : null;
}
