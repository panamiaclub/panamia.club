import type { ContactCategory } from '@/lib/contact-categories';

// Who is notified about a Contact Us submission, by category.
//
// This exists because `sendTemplateEmail`'s recipient fallback is
// `DEV_RECEIVER_EMAIL || ADMIN_EMAILS.split(',')[0]` — the FIRST admin entry
// only — which is not a routing decision, it is an accident of ordering. See
// docs/CONTACT-ROADMAP.md, Phase 1.
//
// Two axes, kept separate on purpose:
//   - category decides which role is notified (below),
//   - authentication decides only whether the all-admin fan-out also fires.

export type ContactRole = 'operators' | 'team';

// `technical` and `general` are answerable by whoever runs the site; `press`
// and `membership` are not. `other` is the catch-all and goes to operators,
// who can forward what turns out to belong to someone else — the opposite
// default would put unclassifiable mail in front of the people least able to
// triage it.
export const CONTACT_CATEGORY_ROLE: Record<ContactCategory, ContactRole> = {
  technical: 'operators',
  general: 'operators',
  other: 'operators',
  press: 'team',
  membership: 'team',
};

// Role addresses. Hardcoded rather than configured: these are role aliases on
// the org's own domain, not staff addresses, so there is nothing sensitive
// here and nothing that changes when staffing does — re-pointing a role is a
// mail-alias edit with no deploy at all.
//
// Both roles currently resolve to the same shared address because no `press@`
// or `membership@` alias exists yet. Splitting them later means editing this
// map and nothing else; every call site already asks for a role, not an
// address. Do NOT put an alias here before it is confirmed deliverable — an
// address that bounces silently drops the inquiries this routing exists to
// protect (Goal 2).
const ROLE_ADDRESSES: Record<ContactRole, string> = {
  operators: 'hola@panamia.club',
  team: 'hola@panamia.club',
};

export function roleForCategory(category: ContactCategory): ContactRole {
  return CONTACT_CATEGORY_ROLE[category];
}

export function addressForRole(role: ContactRole): string {
  return ROLE_ADDRESSES[role];
}

export function addressForCategory(category: ContactCategory): string {
  return addressForRole(roleForCategory(category));
}

/**
 * Every configured admin address. Parsed the same way as
 * `notifyAdminsOfReport` in lib/server/relay-reports.ts — the single existing
 * fan-out in the codebase.
 */
export function adminAddresses(): string[] {
  return (
    process.env.ADMIN_EMAILS?.split(',')
      .map((e) => e.trim())
      .filter(Boolean) || []
  );
}

/**
 * Whether a submission also fans out to every admin, on top of the role
 * address. Deliberately narrow: only unauthenticated `press`, which is the
 * highest-cost failure mode and the one least likely to arrive from an account
 * we can trace. Broad notifications that fire often get filtered, which is the
 * failure this routing is correcting.
 */
export function shouldFanOutToAdmins(
  category: ContactCategory,
  isAuthenticated: boolean
): boolean {
  return category === 'press' && !isAuthenticated;
}

/**
 * The full recipient list for a submission: the role address, plus every admin
 * when the fan-out applies. Deduplicated case-insensitively so an admin who is
 * also behind the role alias is not mailed twice.
 */
export function notificationRecipients(
  category: ContactCategory,
  isAuthenticated: boolean
): string[] {
  const recipients = [addressForCategory(category)];
  if (shouldFanOutToAdmins(category, isAuthenticated)) {
    recipients.push(...adminAddresses());
  }

  const seen = new Set<string>();
  return recipients.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
