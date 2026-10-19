/**
 * WebFinger Endpoint
 *
 * Implements RFC 7033 WebFinger for ActivityPub actor discovery.
 * When someone searches for @username@panamia.club, their server
 * queries this endpoint to find the actor's profile URL.
 *
 * @see https://tools.ietf.org/html/rfc7033
 * @see https://docs.joinmastodon.org/spec/webfinger/
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActorByScreenname } from '@/lib/federation/wrappers/actor';
import { socialConfig, getActorUrl } from '@/lib/federation';
import { corsHeaders } from '@/lib/federation/cors';
import { db } from '@/lib/db';
import { screennameHistory } from '@/lib/schema';
import { sql } from 'drizzle-orm';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders('GET', 'OPTIONS'),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource');

  if (!resource) {
    return NextResponse.json(
      { error: 'Missing resource parameter' },
      { status: 400, headers: corsHeaders('GET') }
    );
  }

  // Parse acct:username@domain format
  const acctMatch = resource.match(/^acct:([^@]+)@(.+)$/);
  if (!acctMatch) {
    return NextResponse.json(
      { error: 'Invalid resource format. Expected acct:username@domain' },
      { status: 400, headers: corsHeaders('GET') }
    );
  }

  const [, username, domain] = acctMatch;

  // Only respond for our domain
  if (domain !== socialConfig.domain) {
    return NextResponse.json(
      { error: 'Resource not found' },
      { status: 404, headers: corsHeaders('GET') }
    );
  }

  // Look up the actor
  const actor = await getActorByScreenname(username);

  if (!actor) {
    // Check if this is a historical screenname (user changed their screenname)
    const historical = await db.query.screennameHistory.findFirst({
      where: sql`lower(${screennameHistory.screenname}) = lower(${username})`,
    });

    if (historical) {
      // Return 410 Gone - actor moved/deleted
      return new NextResponse(null, {
        status: 410,
        headers: corsHeaders('GET'),
      });
    }

    return NextResponse.json(
      { error: 'Resource not found' },
      { status: 404, headers: corsHeaders('GET') }
    );
  }

  const actorUrl = getActorUrl(username);

  // Return WebFinger response
  const webfingerResponse = {
    subject: `acct:${username}@${domain}`,
    aliases: [actorUrl],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorUrl,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${domain}/p/${username}`,
      },
    ],
  };

  return NextResponse.json(webfingerResponse, {
    headers: {
      ...corsHeaders('GET'),
      'Content-Type': 'application/jrd+json; charset=utf-8',
      'Cache-Control': 'max-age=3600',
    },
  });
}
