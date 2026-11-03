import { contactSubmissionCategory } from '@/lib/schema';

// The categories offered on /form/contact-us and used to triage the admin
// queue at /admin/contactus. The values are the DB enum members, so the
// list is derived from the schema rather than hand-repeated — adding a category
// means adding an enum member (plus a migration) and a label below.
export type ContactCategory =
  (typeof contactSubmissionCategory.enumValues)[number];

export const CONTACT_CATEGORIES = contactSubmissionCategory.enumValues;

export const VALID_CONTACT_CATEGORIES = new Set<string>(CONTACT_CATEGORIES);

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === 'string' && VALID_CONTACT_CATEGORIES.has(value);
}

// Admin-facing English labels. The public form pulls its labels from the
// `contact` i18n namespace instead (categories.<value>) so they translate.
export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  general: 'General question',
  membership: 'Membership & profiles',
  press: 'Press & partnerships',
  technical: 'Technical / website issue',
  other: 'Other',
  safety: 'Safety / abusive content or users',
};
