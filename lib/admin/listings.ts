/**
 * The directory listing review queue, as data.
 *
 * Pure. Everything here takes a plain object and returns a plain value, so the
 * flag rules and the stats can be tested without a database and the route can
 * stay thin. The database half lives in `app/api/admin/listings/route.ts`.
 *
 * ## What a pending listing actually contains
 *
 * Less than the mock this screen was designed against assumed. `/form/get-listed`
 * writes no `categories` and no `counties` — those columns stay NULL on every
 * intake row — so the queue cannot show category or county chips without
 * inventing them. What intake *does* capture is `descriptions.tags` (category
 * labels as text), `addressLocality`/`addressRegion`, and `status.locallyBased`,
 * and those are what the queue renders instead. See `app/api/listings/intake`.
 */

/**
 * The reasons a listing gets held up, as things the application can be checked
 * against rather than opinions about the business.
 *
 * ## What is deliberately missing
 *
 * The design called for a "looks like a chain" flag. There is nothing in an
 * intake row that can decide that — it would have to be a keyword list against
 * the business name, which would be wrong often, and wrong in a specific
 * direction: it would tell a reviewer that a legitimate independent pana looks
 * like a franchise. A flag a reviewer learns to ignore is worse than no flag,
 * and one that quietly biases them against a real applicant is worse again.
 *
 * Every flag below is a fact about the submission, and every one of them has a
 * legitimate explanation. They say "read this one properly", never "decline".
 */
export type ReviewFlag =
  | 'no-socials'
  | 'possible-duplicate'
  | 'outside-area'
  | 'locality-unclear'
  | 'thin-details';

export const FLAG_LABEL: Record<ReviewFlag, string> = {
  'no-socials': 'No socials to verify',
  'possible-duplicate': 'Possible duplicate',
  'outside-area': 'Says not locally based',
  'locality-unclear': 'Locality unclear',
  'thin-details': 'Thin details',
};

export const FLAG_NOTE: Record<ReviewFlag, string> = {
  'no-socials':
    'No Instagram or site on the application, so there is nothing to check the listing against.',
  'possible-duplicate':
    'Another profile already uses a name this close. One of them is probably a re-submission.',
  'outside-area':
    'Answered "no" when the form asked whether they are based in South Florida.',
  'locality-unclear':
    'Answered "other" when the form asked whether they are based in South Florida, so it needs reading.',
  'thin-details':
    'Description is too short to tell a visitor what they actually do.',
};

/**
 * Below this many characters, a description is a label rather than an answer.
 *
 * The form allows a thousand. A sentence or two lands near this mark, so the
 * flag fires on the ones that are a handful of words — "we sell candles" — and
 * stays quiet otherwise. It is a prompt to look, not a threshold for declining,
 * which is why it is this blunt.
 */
export const THIN_DETAILS_CHARS = 140;

/**
 * The service level the queue is measured against.
 *
 * Fourteen days is not a policy that exists yet — it is a proposal this screen
 * makes concrete. Pick a number, and the backlog stops being a vague worry and
 * becomes a count you can read off the top of the page.
 */
export const REVIEW_SLA_DAYS = 14;

/** A listing waiting on a decision, as the queue endpoint serialises it. */
export interface QueueListing {
  id: string;
  name: string;
  /** The contact on the listing itself. */
  email: string;
  /** `profiles.created_at`, ISO. */
  submittedAt: string;
  /** `address_locality`, blank when they said they have no storefront. */
  locality: string;
  region: string;
  /** `descriptions.fiveWords`. */
  fiveWords: string;
  /** `descriptions.details`. */
  details: string;
  /** `descriptions.tags`, split back into labels. Intake's nearest thing to categories. */
  tags: string[];
  instagram: string;
  website: string;
  phoneNumber: string;
  /**
   * Account email awaiting explicit setup confirmation. An invitation is not
   * proof of ownership, even when it matches the business contact.
   */
  pendingOwnerEmail: string;
  /** Actual administration link, not an unanswered email invitation. */
  claimed: boolean;
  /** `status.accountType`: 'directory' or 'hybrid'. */
  accountType: string;
  /** `status.locallyBased`: 'yes', 'no', 'other' or blank. */
  locallyBased: string;
  flags: ReviewFlag[];
}

/** A listing that has been answered. */
export interface DecidedListing {
  id: string;
  name: string;
  locality: string;
  /** ISO. `status.approved` or `status.declined`. */
  decidedAt: string;
  decision: 'approved' | 'declined';
  /**
   * `status.decidedBy`. Blank on rows decided through the emailed link, which
   * has no session to attribute. Shown as such rather than guessed at.
   */
  decidedBy: string;
  reason: string;
}

/**
 * Reduce a business name to something two spellings of it agree on.
 *
 * Case, accents, punctuation, spacing and the trailing company suffix are all
 * things the same business writes differently on two different days, and all
 * of them would otherwise hide a duplicate. Accents matter more here than they
 * would elsewhere: this is a Latino business directory, so "Taller Lucía" and
 * "Taller Lucia" are the same shop far more often than they are two shops, and
 * folding them is what catches the re-submission from someone whose phone
 * keyboard did not have the accent that day.
 *
 * Everything else is left alone — this is looking for re-submissions, not for
 * similar businesses.
 */
export function normalizeListingName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|inc|co|corp|ltd|the)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The application fields the flag rules read. */
export interface FlagInput {
  name: string;
  details: string;
  instagram: string;
  website: string;
  locallyBased: string;
}

/**
 * @param otherNames Normalised names of every *other* profile on the site.
 *   Built once per request by the route rather than per row, because this is
 *   a set membership test and the alternative is a query per application.
 */
export function computeFlags(
  listing: FlagInput,
  otherNames: ReadonlySet<string>
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];

  if (!listing.instagram && !listing.website) flags.push('no-socials');

  const normalized = normalizeListingName(listing.name);
  if (normalized && otherNames.has(normalized))
    flags.push('possible-duplicate');

  if (listing.locallyBased === 'no') flags.push('outside-area');
  else if (listing.locallyBased === 'other') flags.push('locality-unclear');

  if (listing.details.trim().length < THIN_DETAILS_CHARS) {
    flags.push('thin-details');
  }

  return flags;
}

export function daysWaiting(submittedAt: string | Date): number {
  const start = new Date(submittedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}

/** How long something has sat, in the words a reviewer would use. */
export function waitLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export interface ListingStat {
  label: string;
  value: string;
  note: string;
}

export function listingStats(rows: readonly QueueListing[]): ListingStat[] {
  const waits = rows
    .map((r) => daysWaiting(r.submittedAt))
    .sort((a, b) => a - b);
  const overdue = waits.filter((d) => d > REVIEW_SLA_DAYS).length;
  const median = waits.length
    ? waits.length % 2
      ? waits[(waits.length - 1) / 2]
      : Math.round((waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2)
    : 0;
  const unclaimed = rows.filter((r) => !r.claimed).length;
  const flagged = rows.filter((r) => r.flags.length > 0).length;

  return [
    {
      label: 'Waiting',
      value: String(rows.length),
      note: 'applications with no decision',
    },
    {
      label: `Over ${REVIEW_SLA_DAYS} days`,
      value: String(overdue),
      note: 'past the review window',
    },
    {
      label: 'Median wait',
      value: waitLabel(median),
      note: 'half have waited longer',
    },
    {
      label: 'Oldest',
      value: waitLabel(waits[waits.length - 1] ?? 0),
      note: 'still untouched',
    },
    {
      label: 'Need a look',
      value: String(flagged),
      note: `${unclaimed} also unclaimed`,
    },
  ];
}

/** Oldest first. A queue sorted any other way is a list, not a queue. */
export function queueOrder(rows: readonly QueueListing[]): QueueListing[] {
  return [...rows].sort(
    (a, b) =>
      new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );
}
