import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { profiles, profileOwners, referralEvents } from '@/lib/schema';
import { and, sql } from 'drizzle-orm';
import { verifyTurnstile } from '@/lib/turnstile';
import { createUniqueString } from '@/lib/standardized';
import { BUSINESS_INTAKE_SOURCE } from '@/lib/server/profile-owners';
import { describeDbError } from '@/lib/server/db-error';
import { sendListingSubmissionEmails } from '@/lib/server/listing-submission';
import { auth, sendMagicLinkTo } from '@/auth';
import { profileCategoryList } from '@/lib/lists';
import type { ProfileDescriptions } from '@/lib/interfaces';
import { REFERRAL_COOKIE } from '@/lib/referrals';
import {
  attachReferralToUser,
  getActiveCookieAttribution,
  resolveReferralAttribution,
} from '@/lib/server/referrals';

/**
 * Public business intake — the front door for getting listed.
 *
 * Deliberately unauthenticated. Most South Florida businesses hear about Pana
 * from another Pana, not from the site, and making them create an account
 * before they can tell us they exist loses them. This writes an *unclaimed*
 * listing: `profiles.userId` stays null. A signed-in applicant can explicitly
 * manage it through profile_owners; guests can invite a personal address or
 * claim it later. The contact email never determines account ownership.
 *
 * Unclaimed rows are already first-class in the directory — see
 * lib/server/directory.ts, which ORs `isNull(profiles.userId)` with the
 * account-type check — so nothing here needs to touch `users.accountType`.
 * There is no user row to carry one.
 *
 * Submissions land inactive and go through the existing email-driven review:
 * the admin notification carries approve/decline links back to
 * /admin/profile/action, which flips `active` and mails the business. That
 * loop already works for rows without a user, since it keys off email.
 */

const validateEmail = (email: string): boolean => {
  const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return regEx.test(email);
};

/**
 * Reduce whatever someone pasted to a bare handle. People paste full profile
 * URLs, "@handle", or a handle with a trailing slash roughly equally often.
 */
function normalizeInstagram(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const fromUrl = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i
  );
  const handle = fromUrl ? fromUrl[1] : trimmed.replace(/^@+/, '');
  return handle.replace(/\/+$/, '').slice(0, 60);
}

/** Accept "shop.com" as readily as "https://shop.com". */
function normalizeWebsite(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString().slice(0, 200);
  } catch {
    return '';
  }
}

function asTrimmedString(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLength);
}

/**
 * Tags arrive as category *values* and are stored as their human labels.
 *
 * Filtering against the shared list rather than trusting the payload keeps a
 * public endpoint from writing arbitrary text into a field that reviewers and
 * the directory both read. Storing labels keeps `descriptions.tags` readable
 * in the admin notification, which is what it was always for.
 */
function normalizeTags(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  const labels = new Map(profileCategoryList.map((c) => [c.value, c.desc]));
  const picked: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const label = labels.get(entry);
    if (label && !picked.includes(label)) picked.push(label);
  }
  return picked.join(', ');
}

const PRONOUN_LABELS: Record<string, string> = {
  sheher: 'She/Her',
  hehim: 'He/Him',
  theythem: 'They/Them',
  none: 'No preference',
};

/** Collapse the pronoun choice to the single text column on `profiles`. */
function normalizePronouns(choice: unknown, other: unknown): string {
  if (typeof choice !== 'string' || !choice) return '';
  if (choice === 'other') return asTrimmedString(other, 40);
  return PRONOUN_LABELS[choice] || '';
}

const LISTING_TYPES = new Set(['directory', 'hybrid']);
const LOCALLY_BASED = new Set(['yes', 'no', 'other']);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Could not read that submission. Please try again.' },
      { status: 400 }
    );
  }

  const name = asTrimmedString(body.name, 100);
  const email = asTrimmedString(body.email, 100).toLowerCase();
  // Optional. The address of the human who should end up administering this
  // listing, which is often not the address the business publishes. It is
  // never required: someone listing a shop on its behalf has no personal
  // address to give, and demanding one would put an account back in front of
  // the form.
  const personalEmail = asTrimmedString(body.personalEmail, 100).toLowerCase();
  const fiveWords = asTrimmedString(body.fiveWords, 120);
  const details = asTrimmedString(body.details, 1000);
  const phoneNumber = asTrimmedString(body.phoneNumber, 30);
  const instagram = normalizeInstagram(body.instagram);
  const website = normalizeWebsite(body.website);
  const tags = normalizeTags(body.tags);
  const hearaboutus = asTrimmedString(body.hearAboutUs, 500);
  const pronouns = normalizePronouns(body.pronouns, body.pronounsOther);
  const accountType = LISTING_TYPES.has(body.accountType as string)
    ? (body.accountType as string)
    : 'directory';
  const locallyBased = LOCALLY_BASED.has(body.locallyBased as string)
    ? (body.locallyBased as string)
    : '';
  // Address is only meaningful when they said they have a storefront; ignoring
  // it otherwise keeps a stale half-filled address from riding along if someone
  // ticks the box, types, then unticks it.
  const hasStorefront = body.hasStorefront === true;
  const addressLine1 = hasStorefront
    ? asTrimmedString(body.addressLine1, 120)
    : '';
  const addressLine2 = hasStorefront
    ? asTrimmedString(body.addressLine2, 120)
    : '';
  const addressLocality = hasStorefront
    ? asTrimmedString(body.addressLocality, 80)
    : '';
  const addressRegion = hasStorefront
    ? asTrimmedString(body.addressRegion, 2).toUpperCase()
    : '';
  const addressPostalCode = hasStorefront
    ? asTrimmedString(body.addressPostalCode, 10)
    : '';
  const addressHours = hasStorefront
    ? asTrimmedString(body.addressHours, 300)
    : '';
  const { turnstileToken } = body;

  if (name.length < 2) {
    return NextResponse.json(
      { error: 'Please enter your business name (at least 2 characters).' },
      { status: 400 }
    );
  }

  if (!validateEmail(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }

  // An optional field must never be able to cost someone their listing, so a
  // personal address that is unusable is dropped rather than rejected. The
  // form validates it inline where it can still be corrected or cleared; by
  // the time it reaches here, refusing the whole submission over a field that
  // was never required would be a worse outcome than silently not sending an
  // invitation.
  //
  // It may equal the business address. Asking for an account is an explicit
  // choice, independent of which inbox receives listing updates.
  const pendingOwnerEmail =
    personalEmail && validateEmail(personalEmail) ? personalEmail : null;

  if (fiveWords.length < 3) {
    return NextResponse.json(
      { error: 'Please tell us what you do in a few words.' },
      { status: 400 }
    );
  }

  // At least one public link. This is the only thing a reviewer can use to
  // confirm a submission is a real South Florida business rather than noise,
  // and it doubles as the source for prefilling the profile later.
  if (!instagram && !website) {
    return NextResponse.json(
      {
        error:
          'Please add an Instagram handle or a website so we can find you.',
      },
      { status: 400 }
    );
  }

  // Consent is a legal record, not a UI nicety — the client gates on it, and
  // so does this, because the client is not the only thing that can post here.
  if (body.agreeTos !== true) {
    return NextResponse.json(
      { error: 'Please accept the Terms and Conditions to continue.' },
      { status: 400 }
    );
  }

  if (hasStorefront && (!addressLine1 || !addressLocality)) {
    return NextResponse.json(
      {
        error:
          'Please include the street address and city for your storefront.',
      },
      { status: 400 }
    );
  }

  // Turnstile is required unconditionally. This endpoint has no session to
  // lean on, so the token is the only bot check standing between a scripted
  // client and the directory.
  if (!turnstileToken || typeof turnstileToken !== 'string') {
    return NextResponse.json(
      { error: 'Verification required.' },
      { status: 400 }
    );
  }

  const isValid = await verifyTurnstile(turnstileToken);
  if (!isValid) {
    return NextResponse.json(
      {
        error: 'Verification failed. Please try again or contact us in-person.',
      },
      { status: 400 }
    );
  }

  try {
    const session = await auth();
    const manageWithPana = body.manageWithPana === true;
    if (manageWithPana && !session?.user?.id) {
      return NextResponse.json(
        {
          error:
            'Sign in again to manage this listing, or choose to claim it later.',
        },
        { status: 401 }
      );
    }
    if (
      manageWithPana &&
      body.expectedManagerId != null &&
      body.expectedManagerId !== session?.user?.id
    ) {
      return NextResponse.json(
        {
          code: 'manager_changed',
          error:
            'Your Pana sign-in changed. Confirm the listing contact and management choice again.',
        },
        { status: 409 }
      );
    }

    // A matching personal profile is not a duplicate application. Different
    // listings may also share an inbox; only the same name and contact collide.
    const existingProfile = await db.query.profiles.findFirst({
      where: and(
        sql`lower(${profiles.email}) = ${email}`,
        sql`lower(${profiles.name}) = lower(${name})`,
        sql`${profiles.status}->>'source' = ${BUSINESS_INTAKE_SOURCE}`
      ),
      columns: { id: true },
    });

    if (existingProfile) {
      return NextResponse.json(
        {
          error:
            'A listing with this name and contact email has already been submitted. Sign in to manage it, or contact us if you need help claiming it.',
        },
        { status: 409 }
      );
    }

    const descriptions: ProfileDescriptions = {
      fiveWords,
      details,
      tags,
      hearaboutus,
    };

    const submittedAt = new Date();
    const cookieAttribution = await getActiveCookieAttribution(request);
    if (session?.user?.id && cookieAttribution) {
      await attachReferralToUser(cookieAttribution.id, session.user.id);
    }
    const referralAttribution = await resolveReferralAttribution(
      request,
      session?.user?.id
    );

    const createdProfile = await db.transaction(async (tx) => {
      const [createdProfile] = await tx
        .insert(profiles)
        .values({
          // Ownership belongs in profile_owners, never the human's identity slot.
          userId: null,
          name,
          email,
          // Recorded, not honoured. This is an attacker-writable field on a public
          // form, so it only ever becomes an invitation the named person can
          // accept or dismiss once signed in — never an ownership grant. See
          // lib/server/pending-listing-owner.ts.
          pendingOwnerEmail: manageWithPana ? null : pendingOwnerEmail,
          phoneNumber: phoneNumber || null,
          pronouns: pronouns || null,
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          addressLocality: addressLocality || null,
          addressRegion: addressRegion || null,
          addressPostalCode: addressPostalCode || null,
          addressCountry: hasStorefront ? 'US' : null,
          addressHours: addressHours || null,
          active: false,
          descriptions,
          socials: { instagram, website },
          status: {
            submitted: submittedAt.toISOString(),
            access: createUniqueString(),
            // Marks this row as a business listing rather than a personal profile
            // waiting for its owner. Implicit auto-claim at sign-in skips it so
            // that claiming a business never overwrites someone's own identity —
            // see lib/server/profile-owners.ts.
            source: BUSINESS_INTAKE_SOURCE,
            // An unclaimed row has no user to carry `users.accountType`, and the
            // eligibility answer is about the submission rather than the business.
            // Both are kept here as a record of what was submitted, for review.
            //
            // Do not copy accountType onto the claimant's user row when this
            // listing is claimed. A listing is attached through profile_owners and
            // the claimant's own account stays personal; writing it back would
            // publish their identity profile in the directory, which is exactly
            // the person/business conflation the become-a-pana removal undid. See
            // app/api/listings/claim/verify/route.ts.
            accountType,
            locallyBased,
            agreedToTermsAt: submittedAt.toISOString(),
          },
        })
        .returning();

      if (manageWithPana && session?.user?.id) {
        await tx.insert(profileOwners).values({
          profileId: createdProfile.id,
          userId: session.user.id,
          role: 'owner',
        });
      }

      if (referralAttribution && createdProfile) {
        await tx
          .insert(referralEvents)
          .values({
            attributionId: referralAttribution.id,
            eventType: 'directory_submitted',
            referredUserId:
              session?.user?.id ?? referralAttribution.referredUserId,
            profileId: createdProfile.id,
            createdAt: submittedAt,
          })
          .onConflictDoNothing({
            target: [referralEvents.attributionId, referralEvents.eventType],
          });
      }

      return createdProfile;
    });

    try {
      await sendListingSubmissionEmails(createdProfile);
    } catch (error) {
      // The application is committed; a mail outage must not invite a retry
      // that can only report a duplicate. Staff can resend from the saved row.
      console.error('[listings/intake] notification email failed', error);
    }

    let invitationSent = false;
    if (!manageWithPana && pendingOwnerEmail) {
      const callbackParams = new URLSearchParams({ next: '/account' });
      if (referralAttribution) {
        callbackParams.set('attribution', referralAttribution.id);
      }
      invitationSent = await sendOwnerMagicLink(
        pendingOwnerEmail,
        request,
        referralAttribution
          ? `/referral/continue?${callbackParams.toString()}`
          : '/account'
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        profileId: createdProfile.id,
        management: manageWithPana
          ? 'account'
          : pendingOwnerEmail
            ? 'invitation'
            : 'unclaimed',
        invitationEmail: manageWithPana ? null : pendingOwnerEmail,
        invitationSent,
      },
      { status: 201 }
    );
    if (session?.user?.id && cookieAttribution) {
      response.cookies.set(REFERRAL_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    console.error('[listings/intake] submission failed', error);
    const details = describeDbError(error);
    if (
      details.code === '23505' &&
      details.constraint === 'profiles_listing_name_email_unique'
    ) {
      return NextResponse.json(
        {
          error:
            'A listing with this name and contact email has already been submitted. Sign in to manage it, or contact us if you need help claiming it.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong saving your listing. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Start the sign-in for the person named as the listing's owner.
 *
 * better-auth's magic-link flow is findUserByEmail -> createUser ->
 * createSession, so this doubles as account creation for an address we have
 * never seen. That is the whole accelerator: they finish the form, open one
 * email, and land signed in with the invitation waiting for them.
 *
 * The link is a convenience, not the mechanism. Tokens expire in minutes and
 * plenty of people will not open it, so the invitation lives on the profile
 * row instead — any later sign-in, by any method, surfaces it. Nothing is lost
 * by this call failing, which is why it cannot throw: the listing is already
 * committed, and the submitter is owed their 201 regardless.
 *
 * Note this sends mail to an address supplied by an unauthenticated form.
 * Turnstile is the control on that, the same as for every other address on
 * this request — the business email already receives a receipt.
 */
async function sendOwnerMagicLink(
  email: string,
  request: NextRequest,
  callbackUrl: string
): Promise<boolean> {
  try {
    await sendMagicLinkTo(email, request.headers, callbackUrl);
    return true;
  } catch (error) {
    console.error('[listings/intake] owner magic link failed', error);
    return false;
  }
}
