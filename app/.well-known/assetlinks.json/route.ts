/**
 * /.well-known/assetlinks.json — Android App Links.
 *
 * Android only opens a link in an app when the site that owns the domain says
 * it may. This is that statement: it names the app and the signing keys, and
 * Android fetches it over https before honouring any panamia.club link.
 *
 * Without it, App Links still install — and silently do nothing. Every link
 * opens in the browser, which is indistinguishable from never having set them
 * up, because there is no error anywhere to say the verification was refused.
 *
 * Served from a route rather than public/ so the fingerprints can come from
 * the environment. They are not secret — anything here is world-readable by
 * design, and Google publishes the Play signing certificate — but they differ
 * per environment, and a preview Worker serving production's fingerprints
 * would claim links for an app it cannot possibly be.
 *
 * @see https://developer.android.com/training/app-links/verify-android-applinks
 */

import { NextResponse } from 'next/server';
import { MOBILE_APP_ID } from '@/lib/mobile/app-identity';

/**
 * SHA-256 fingerprints of every certificate that signs a shipped build.
 *
 * Plural on purpose, and this is the part that trips people: with Play App
 * Signing there are always at least two. Google re-signs the uploaded bundle
 * with its own key, so what lands on a member's phone carries the Play signing
 * certificate, while local and internal-test builds still carry the upload
 * certificate. List only one and links verify for half the builds — typically
 * the half that was never tested, because the developer's own device runs the
 * other.
 *
 * Both are shown under `Release > Setup > App signing` in the Play Console.
 */
function certFingerprints(): string[] {
  const raw = process.env.ANDROID_APP_CERT_FINGERPRINTS?.trim();
  if (!raw) return [];

  return (
    raw
      .split(',')
      .map((value) => value.trim().toUpperCase())
      /* Shape-checked rather than trusted. A fingerprint that is truncated or
       * carries a stray quote makes the whole file invalid to Android's
       * verifier, which fails the domain as a unit — so one malformed entry
       * takes down App Links for every link on the site, not just for its own
       * build. Dropping it keeps the remaining valid keys working. */
      .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))
  );
}

export function GET() {
  const fingerprints = certFingerprints();

  /* No fingerprints means no verifiable claim, so this says nothing rather
   * than saying something empty. An assetlinks.json listing zero certificates
   * is a well-formed file asserting that no app owns these links, which gets
   * cached and believed; a 404 is the honest "not configured here", and is
   * what every environment without a signed build should return. */
  if (fingerprints.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: MOBILE_APP_ID,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    {
      headers: {
        'Content-Type': 'application/json',
        /* An hour. Android caches this, and the cost of a stale copy is
         * asymmetric: too long and a newly added signing key takes a day to
         * start working, too short and nothing bad happens beyond a few extra
         * requests for a file of a few hundred bytes. */
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
