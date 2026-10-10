/**
 * POST /api/social/gifs/mirror
 *
 * Copies a Tenor GIF into our own R2 bucket and returns attachment metadata
 * ready to hand to /api/social/statuses.
 *
 * Why mirror at all, when passing Tenor's URL straight through would cost
 * nothing: a hotlinked GIF is fetched by the recipient's browser, which means
 * Tenor learns the IP address of everyone a GIF is sent to, and learns it
 * every time the conversation is reopened. Direct messages here are
 * deliberately members-only, deliberately expire after 30 days, and sit
 * behind a Requests folder built to keep strangers from reaching people. A
 * third party quietly collecting the readership of those messages undoes a
 * good part of that. Mirroring also means a DM cannot rot into a broken image
 * when Tenor reorganises its CDN, and that a message which is supposed to
 * disappear is not still sitting on someone else's origin.
 *
 * Objects are keyed per actor, matching /api/social/media. Sharing one object
 * between everyone who sends the same GIF would halve the storage and break
 * account deletion: that sweep deletes the media belonging to an actor's
 * statuses by URL, so a shared object would vanish out of other people's
 * conversations the first time any one sender closed their account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { uploadFile } from '@/lib/blob/api';
import { isTenorMediaUrl } from '@/lib/gifs/tenor';

/* Comfortably clears Tenor's mediumgif and stays under the 10 MB ceiling the
   rest of the media pipeline is built around. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const profile = await getActiveProfileWithActor(session.user.id);
  if (!profile?.socialActor) {
    return NextResponse.json(
      { success: false, error: 'You must enable social features first' },
      { status: 403 }
    );
  }

  let body: { url?: unknown; description?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const source = typeof body.url === 'string' ? body.url : '';

  /* The allowlist check, before anything is fetched. See isTenorMediaUrl --
     without it this route is an open proxy that makes requests from inside
     our network to any address a member names. */
  if (!isTenorMediaUrl(source)) {
    return NextResponse.json(
      { success: false, error: 'Not a Tenor URL' },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(source);
    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch that GIF' },
        { status: 502 }
      );
    }

    /* Checked before reading the body so an oversized file is refused on its
       header rather than after we have pulled all of it into the Worker. */
    const declared = Number(upstream.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'That GIF is too large' },
        { status: 400 }
      );
    }

    const contentType = (upstream.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (contentType !== 'image/gif') {
      return NextResponse.json(
        { success: false, error: 'That URL is not a GIF' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    /* Content-Length is a claim, not a measurement. A server that understates
       it would otherwise walk straight past the check above. */
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'That GIF is too large' },
        { status: 400 }
      );
    }

    const fileName = `social/${profile.socialActor.id}/${crypto.randomUUID()}.gif`;
    const url = await uploadFile(fileName, buffer);

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Upload failed' },
        { status: 500 }
      );
    }

    /* "via Tenor" is the third of Tenor's three sanctioned attributions, the
       one meant for a shared GIF. It lands in the attachment's alt text,
       which is what a screen reader announces and what stands in for the
       image if it fails to load. */
    const description =
      typeof body.description === 'string' && body.description.trim()
        ? `${body.description.trim().slice(0, 180)} (via Tenor)`
        : 'GIF (via Tenor)';

    return NextResponse.json({
      success: true,
      data: {
        type: 'image',
        mediaType: 'image/gif',
        url,
        name: description,
      },
    });
  } catch (error) {
    console.error('GIF mirror failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not save that GIF' },
      { status: 500 }
    );
  }
}
