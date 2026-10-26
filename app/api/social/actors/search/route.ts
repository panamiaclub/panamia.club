/**
 * GET /api/social/actors/search - Search for actors by name or username
 *
 * Two callers: @-mention autocomplete in the voice memo composer, and the
 * Messages search box, which uses it to start a conversation with someone the
 * viewer has never messaged (those people appear in no list that page loads).
 *
 * Returns local actors matching the query string.
 *
 * Query params:
 *   q: search query (min 1 char)
 *   limit: max results (default 10, max 20)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { socialActors } from '@/lib/schema';
import { and, isNotNull, ilike, or, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  const limitParam = parseInt(searchParams.get('limit') || '10', 10);
  const limit = Math.min(Math.max(limitParam, 1), 20);

  if (query.length < 1) {
    return NextResponse.json({
      success: true,
      data: [],
    });
  }

  // Search local actors by name or username (case-insensitive)
  // Only return actors linked to local profiles.
  // Includes current user (allows sending voice memos to yourself) -- callers
  // that cannot act on that row, like the Messages search box, exclude it
  // themselves rather than this endpoint guessing which kind of caller it has.
  //
  // Display name is matched as well as handle because members look for each
  // other by name, and a handle often contains no part of one: searching
  // "Maria" for @mgonzalez found nothing at all before this.
  const actors = await db
    .select({
      id: socialActors.id,
      username: socialActors.username,
      name: socialActors.name,
      iconUrl: socialActors.iconUrl,
      uri: socialActors.uri,
    })
    .from(socialActors)
    .where(
      and(
        isNotNull(socialActors.profileId),
        or(
          ilike(socialActors.username, `%${query}%`),
          ilike(socialActors.name, `%${query}%`)
        )
      )
    )
    .orderBy(asc(socialActors.username))
    .limit(limit);

  return NextResponse.json({
    success: true,
    data: actors.map((actor) => ({
      id: actor.id,
      username: actor.username,
      displayName: actor.name || actor.username,
      avatarUrl: actor.iconUrl,
      uri: actor.uri,
    })),
  });
}
