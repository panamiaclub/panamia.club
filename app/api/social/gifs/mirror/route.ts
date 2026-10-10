/**
 * POST /api/social/gifs/mirror
 *
 * Copies a GIPHY GIF into our own R2 bucket and returns attachment metadata
 * ready to hand to /api/social/statuses.
 *
 * Why mirror at all, when passing GIPHY's URL straight through would cost
 * nothing: a hotlinked GIF is fetched by the recipient's browser, which means
 * GIPHY learns the IP address of everyone a GIF is sent to, and learns it
 * every time the conversation is reopened. Direct messages here are
 * deliberately members-only, deliberately expire after 30 days, and sit
 * behind a Requests folder built to keep strangers from reaching people. A
 * third party quietly collecting the readership of those messages undoes a
 * good part of that. Mirroring also means a DM cannot rot into a broken image
 * when GIPHY reorganises its CDN, and that a message which is supposed to
 * disappear is not still sitting on someone else's origin.
 *
 * Objects are keyed per actor, matching /api/social/media. Sharing one object
 * between everyone who sends the same GIF would halve the storage and break
 * account deletion: that sweep deletes the media belonging to an actor's
 * statuses by URL, so a shared object would vanish out of other people's
 * conversations the first time any one sender closed their account.
 *
 * ---------------------------------------------------------------------------
 * KNOWN DEVIATION FROM GIPHY'S DOCS -- read before changing or copying this.
 *
 * Two different documents get called "GIPHY's terms" and they do not say the
 * same thing. An earlier version of this comment conflated them and claimed
 * the contract forbids what we do here. It does not. The distinction decides
 * what the actual exposure is, so it is spelled out.
 *
 * 1. The developer documentation's "Prohibited Integration Practices" says:
 *
 *      2. Do not cache media URLs or copies of GIPHY media assets unless your
 *         integration has been explicitly approved by GIPHY for media caching
 *         and follows GIPHY's required cache revalidation implementation.
 *      3. Do not proxy requests to GIPHY, either API calls or media URL loads.
 *         All requests to GIPHY should be made directly from the client side.
 *
 *    This route stores; /api/social/gifs proxies and caches. We are plainly
 *    outside that guidance, deliberately.
 *
 * 2. The GIPHY API Terms of Service -- the contract those same docs link to,
 *    and the thing actually agreed to -- contains no prohibition on caching,
 *    proxying, or storing media anywhere in it. What it does contain:
 *
 *      - clause 4: label the application "Powered by Giphy" AND display the
 *        Giphy logo. A conjunction, not a choice. (Picker footer.)
 *      - clause 5: do not display content "without Giphy user and/or source
 *        attribution where available". (The uploader credit carried through
 *        this route into the attachment name.)
 *      - "You shall not use content you obtain through Giphy's products and
 *        services to create a database, directory, or index containing GIFs
 *        or digital stickers." The one genuinely arguable clause. It reads as
 *        aimed at building a rival GIF catalogue, and our R2 objects are
 *        per-recipient message attachments -- not searchable, not an index.
 *        A hostile reading could still stretch it. Flagged, not dismissed.
 *      - clause 2: we follow limits "as provided to you by us from time to
 *        time", which arguably lets GIPHY impose the docs rules regardless.
 *
 * So: no breach anyone can point to, but not blessed either. The remedy GIPHY
 * reserves (clause 1) is denial or revocation of API access without notice.
 * No damages clause, no fee. The exposure is the feature going dark, not money.
 *
 * Why we store anyway. The durable reason is permanence: a hotlinked GIF
 * disappears out of a two-year-old conversation when the host reorganises,
 * loses rights, or shuts down -- not hypothetical, since this integration
 * exists only because Google decommissioned Tenor and took the previous
 * implementation with it. The privacy reason (hotlinking hands GIPHY the IP
 * of every DM recipient on every thread open) is real but should be read
 * sceptically: it was written here to justify an architecture that had
 * already been built, and it carries less weight than its length suggests.
 *
 * GIPHY does operate an approval path ("in some approved high-scale
 * integrations, GIPHY may allow a partner-operated caching layer for media
 * delivery... requires prior written approval") and publishes a Cloudflare
 * revalidation example, which is our stack. But their own docs discourage
 * applying -- "for most applications a rate limited beta key is sufficient",
 * "we receive a lot of applications" -- and the exception targets high-scale
 * partners, which we are not. Applying is not the obvious cheap move.
 *
 * Worth knowing before anyone "fixes" this: full compliance means client-side
 * calls, which means no shared server cache, which means the 100/hour beta
 * quota burns per user instead of once per search term. The cache is the only
 * reason we fit inside that quota, so complying makes a production-tier key a
 * prerequisite rather than a follow-up.
 *
 * Do not treat this as settled and do not resolve it in code. The tradeoff
 * belongs to the product owner.
 * https://developers.giphy.com/docs/api/
 * https://support.giphy.com/hc/en-us/articles/360028134111-GIPHY-API-Terms-of-Service
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { uploadFile } from '@/lib/blob/api';
import { isGifMediaUrl } from '@/lib/gifs/giphy';

/* Comfortably clears GIPHY's downsized_medium and stays under the 10 MB
   ceiling the rest of the media pipeline is built around. */
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

  let body: { url?: unknown; description?: unknown; creator?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const source = typeof body.url === 'string' ? body.url : '';

  /* The allowlist check, before anything is fetched. See isGifMediaUrl --
     without it this route is an open proxy that makes requests from inside
     our network to any address a member names. */
  if (!isGifMediaUrl(source)) {
    return NextResponse.json(
      { success: false, error: 'Not a GIPHY URL' },
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

    /* GIPHY's terms want two different things here and this carries both.
       Clause 4 is the "Powered By GIPHY" credit, which the picker shows as
       their mark but which has to survive the GIF leaving the picker. Clause
       5 is per-content attribution -- content may not be displayed "without
       Giphy user and/or source attribution where available" -- so the
       uploader is named when GIPHY gave us one. It goes in the alt text,
       which is what a screen reader announces and what stands in if the
       image fails. Many GIFs have no uploader, hence the plain form. */
    const creator =
      typeof body.creator === 'string'
        ? // Third-party text landing in a stored attachment name: collapse
          // whitespace so it cannot smuggle newlines into alt text.
          body.creator.replace(/\s+/g, ' ').trim().slice(0, 60)
        : '';

    const base =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim().slice(0, 180)
        : 'GIF';

    const description = creator
      ? `${base} by ${creator} (via GIPHY)`
      : `${base} (via GIPHY)`;

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
