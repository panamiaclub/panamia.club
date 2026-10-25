/**
 * ActivityPub Outbox Collection
 *
 * Returns an OrderedCollection (summary) or OrderedCollectionPage (paginated)
 * of public Create activities for an actor.
 *
 * Only truly public statuses (recipientTo contains PUBLIC) are included.
 * Unlisted posts (local-only) are excluded from federation.
 *
 * Ported from external/activities.next/app/api/users/[username]/outbox/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActorByScreenname } from '@/lib/federation/wrappers/actor';
import { db } from '@/lib/db';
import { socialStatuses, STATUS_TYPE_STORY } from '@/lib/schema';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { socialConfig } from '@/lib/federation';
import { personalStatusesOnly } from '@/lib/federation/wrappers/group-visibility';
import { corsHeaders } from '@/lib/federation/cors';
import { notPanasStatus } from '@/lib/federation/wrappers/visibility';

const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ user: string }> }
) {
  const { user } = await params;

  const actor = await getActorByScreenname(user);
  if (!actor) {
    return NextResponse.json(
      { error: 'Actor not found' },
      { status: 404, headers: corsHeaders('GET') }
    );
  }

  const outboxUrl = actor.outboxUrl;
  const pageParam = (request.nextUrl ?? new URL(request.url)).searchParams.get(
    'page'
  );

  // Without ?page → return OrderedCollection summary
  if (!pageParam) {
    return NextResponse.json(
      {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: outboxUrl,
        type: 'OrderedCollection',
        totalItems: actor.statusCount,
        first: `${outboxUrl}?page=true`,
        last: `${outboxUrl}?min_id=0&page=true`,
      },
      {
        headers: {
          ...corsHeaders('GET'),
          'Content-Type': 'application/activity+json; charset=utf-8',
        },
      }
    );
  }

  // With ?page=true → return OrderedCollectionPage with Create activities
  const statuses = await db.query.socialStatuses.findMany({
    where: and(
      eq(socialStatuses.actorId, actor.id),
      sql`${socialStatuses.published} IS NOT NULL`,
      isNull(socialStatuses.inReplyToId),
      sql`${socialStatuses.recipientTo} @> ${JSON.stringify([PUBLIC])}::jsonb`,
      /**
       * No group posts federate, public groups included.
       *
       * This is stricter than the in-app rule on purpose. A remote server has
       * no notion of our membership table, so once a post leaves here we have
       * handed over the only thing enforcing who may read it, and we cannot
       * take it back — the copy is already on their disk. Group federation is
       * a deliberate later step (GROUPS-ROADMAP, "Open questions"), gated on
       * this outbox being audited first, and until then the safe default is
       * that a group's posts stay on Pana.
       */
      personalStatusesOnly(),
      // Stories never federate. They are addressed followers-only, so the
      // Public check above already excludes them -- this is the second lock,
      // because the cost of it failing is asymmetric. A story delivered to a
      // remote server becomes a post there: Mastodon has no story concept and
      // no expiry, so the 24-hour promise made to the author quietly does not
      // apply to the copy, and we cannot recall it.
      ne(socialStatuses.type, STATUS_TYPE_STORY),
      notPanasStatus(),
      or(
        isNull(socialStatuses.expiresAt),
        gt(socialStatuses.expiresAt, new Date())
      )
    ),
    with: { attachments: true },
    orderBy: (t, { desc }) => [desc(t.published)],
    limit: 20,
  });

  const LICENSE_DEED: Record<string, string> = {
    'cc-by-4': 'https://creativecommons.org/licenses/by/4.0/',
    'cc-by-sa-4': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'cc-0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  };

  const orderedItems = statuses.map((status) => ({
    id: `${status.uri}/activity`,
    type: 'Create',
    actor: actor.uri,
    published: status.published!.toISOString(),
    to: status.recipientTo as string[],
    cc: status.recipientCc as string[],
    object: {
      id: status.uri,
      type: 'Note',
      attributedTo: actor.uri,
      content: status.content || '',
      published: status.published!.toISOString(),
      to: status.recipientTo as string[],
      cc: status.recipientCc as string[],
      url:
        status.url ||
        `https://${socialConfig.domain}/p/${actor.username}/statuses/${status.id}`,
      inReplyTo: null,
      attachment: status.attachments.map((a) => ({
        type: 'Document',
        mediaType: a.mediaType || 'application/octet-stream',
        url: a.url,
        name: a.name || '',
      })),
      tag: [],
      summary: status.contentWarning || null,
      'cc:license': LICENSE_DEED[status.ccLicense] || LICENSE_DEED['cc-by-4'],
    },
  }));

  return NextResponse.json(
    {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${outboxUrl}?page=true`,
      type: 'OrderedCollectionPage',
      partOf: outboxUrl,
      orderedItems,
    },
    {
      headers: {
        ...corsHeaders('GET'),
        'Content-Type': 'application/activity+json; charset=utf-8',
      },
    }
  );
}
