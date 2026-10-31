import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';

import {
  computeFlags,
  normalizeListingName,
  type DecidedListing,
  type QueueListing,
} from '@/lib/admin/listings';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  BUSINESS_INTAKE_SOURCE,
  claimedProfileIds,
} from '@/lib/server/profile-owners';

/**
 * The directory review queue.
 *
 * ## What counts as waiting
 *
 * A pending listing is a `profiles` row that is inactive, came from
 * `/form/get-listed`, and has neither an approve nor a decline stamp. The
 * source check is what separates it from the far larger population of ordinary
 * member profiles, which are also rows on this table — every signed-in member
 * now has one, so filtering on `active = false` alone would return the whole
 * site.
 *
 * ## Why the whole name list is read
 *
 * Duplicate detection is a set membership test against every other profile.
 * Doing it per row would be a query per application; doing it as a join would
 * need a normalised name in the database, which does not exist. One column of
 * one table is cheap, and this page is read by a handful of staff.
 */

interface Descriptions {
  fiveWords?: string;
  details?: string;
  tags?: string;
}

interface Socials {
  instagram?: string;
  website?: string;
}

interface Status {
  approved?: string;
  declined?: string;
  decidedBy?: string;
  decidedReason?: string;
  accountType?: string;
  locallyBased?: string;
}

const isIntake = sql`${profiles.status} ->> 'source' = ${BUSINESS_INTAKE_SOURCE}`;
const undecided = sql`${profiles.status} ->> 'approved' is null and ${profiles.status} ->> 'declined' is null`;

export async function GET() {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  try {
    const [pendingRows, decidedRows, allNames] = await Promise.all([
      db
        .select()
        .from(profiles)
        .where(and(eq(profiles.active, false), isIntake, undecided)),
      db
        .select({
          id: profiles.id,
          name: profiles.name,
          addressLocality: profiles.addressLocality,
          addressRegion: profiles.addressRegion,
          status: profiles.status,
        })
        .from(profiles)
        .where(
          and(
            isIntake,
            sql`(${profiles.status} ->> 'approved' is not null or ${profiles.status} ->> 'declined' is not null)`
          )
        )
        .orderBy(
          sql`coalesce(${profiles.status} ->> 'approved', ${profiles.status} ->> 'declined') desc`
        )
        .limit(12),
      db.select({ id: profiles.id, name: profiles.name }).from(profiles),
    ]);

    const pendingIds = new Set(pendingRows.map((row) => row.id));
    const claimed = await claimedProfileIds([...pendingIds]);
    // Names of everything that is *not* in the queue. Without this exclusion
    // every application would flag itself as its own duplicate.
    const otherNames = new Set(
      allNames
        .filter((row) => !pendingIds.has(row.id))
        .map((row) => normalizeListingName(row.name ?? ''))
        .filter(Boolean)
    );

    const pending: QueueListing[] = pendingRows.map((row) => {
      const descriptions = (row.descriptions ?? {}) as Descriptions;
      const socials = (row.socials ?? {}) as Socials;
      const status = (row.status ?? {}) as Status;

      const details = descriptions.details ?? '';
      const instagram = socials.instagram ?? '';
      const website = socials.website ?? '';
      const locallyBased = status.locallyBased ?? '';

      return {
        id: row.id,
        name: row.name ?? '',
        email: row.email ?? '',
        submittedAt: (row.createdAt ?? new Date()).toISOString(),
        locality: row.addressLocality ?? '',
        region: row.addressRegion ?? '',
        fiveWords: descriptions.fiveWords ?? '',
        details,
        tags: (descriptions.tags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        instagram,
        website,
        phoneNumber: row.phoneNumber ?? '',
        pendingOwnerEmail: row.pendingOwnerEmail ?? '',
        claimed: claimed.has(row.id),
        accountType: status.accountType ?? 'directory',
        locallyBased,
        flags: computeFlags(
          { name: row.name ?? '', details, instagram, website, locallyBased },
          otherNames
        ),
      };
    });

    const decided: DecidedListing[] = decidedRows.map((row) => {
      const status = (row.status ?? {}) as Status;
      const approved = Boolean(status.approved);
      return {
        id: row.id,
        name: row.name ?? '',
        locality: row.addressLocality ?? row.addressRegion ?? '',
        decidedAt: (approved ? status.approved : status.declined) ?? '',
        decision: approved ? 'approved' : 'declined',
        decidedBy: status.decidedBy ?? '',
        reason: status.decidedReason ?? '',
      };
    });

    return NextResponse.json({ pending, decided });
  } catch (error) {
    console.error('Failed to load the listing queue', error);
    return NextResponse.json(
      { error: 'Could not load the review queue.' },
      { status: 500 }
    );
  }
}
