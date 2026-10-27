import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MOBILE_MAGIC_LINK_PATH } from '@/lib/mobile/auth-links';

const AP_TYPES = ['application/activity+json', 'application/ld+json'];

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const canonicalUrl = process.env.NEXT_PUBLIC_HOST_URL;
  if (canonicalUrl && host.endsWith('.workers.dev')) {
    const target = new URL(request.url);
    const canonical = new URL(canonicalUrl);
    target.host = canonical.host;
    target.port = '';
    target.protocol = canonical.protocol;
    return NextResponse.redirect(target, 301);
  }

  // ActivityPub content negotiation for /p/:screenname
  // Runs before trailing-slash 308 redirects, fixing federation
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/p\/([^/]+)\/?$/);
  if (match) {
    const accept = request.headers.get('accept') || '';
    const wantsAP = AP_TYPES.some((t) => accept.includes(t));
    if (wantsAP) {
      const screenname = match[1];
      return NextResponse.rewrite(
        new URL(`/api/federation/actor/${screenname}`, request.url)
      );
    }
  }

  // ActivityPub content negotiation for /e/:slug (events)
  const eventMatch = pathname.match(/^\/e\/([^/]+)\/?$/);
  if (eventMatch) {
    const accept = request.headers.get('accept') || '';
    const wantsAP = AP_TYPES.some((t) => accept.includes(t));
    if (wantsAP) {
      const eventSlug = eventMatch[1];
      return NextResponse.rewrite(
        new URL(`/api/federation/events/${eventSlug}`, request.url)
      );
    }
  }

  // GPC (Global Privacy Control) detection — Phase 3 consent infrastructure
  // Reads Sec-GPC header and forwards it as x-gpc-detected for downstream
  // consumption (e.g., /api/consent/record reads this to store on receipts).
  // See docs/PRIVACY-ROADMAP.md § Global Privacy Control for behavioral spec.
  const gpcDetected = request.headers.get('sec-gpc') === '1';

  // Set security headers
  const response = NextResponse.next();

  // Keep signed-in responses out of the shared cache. Workers Cache keys on the
  // URL alone, so anything cached for a signed-in visitor is served to everyone.
  // Keying off the cookie rather than a route list covers future routes too;
  // anonymous requests carry no cookie and still cache normally.
  // better-auth accepts either separator, with or without the __Secure- prefix.
  const hasSessionCookie =
    /(?:^|;\s*)(?:__Secure-)?better-auth[.-]session_token=/.test(
      request.headers.get('cookie') ?? ''
    );
  const isMobileAuthPage =
    pathname.replace(/\/+$/, '') === MOBILE_MAGIC_LINK_PATH;
  if (hasSessionCookie || isMobileAuthPage) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }

  // Forward GPC detection status to server components and API routes
  if (gpcDetected) {
    response.headers.set('x-gpc-detected', '1');
  }

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // XSS protection (legacy but still good to have)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  response.headers.set(
    'Referrer-Policy',
    isMobileAuthPage ? 'no-referrer' : 'strict-origin-when-cross-origin'
  );

  // Permissions policy - restrict access to sensitive APIs
  //
  // `self` rather than `()` for geolocation: an empty allowlist blocks the API
  // for every origin *including this one*, so getCurrentPosition() rejects with
  // PERMISSION_DENIED before the browser ever shows its prompt. The directory's
  // "Use my location" distance sort needs first-party access; `self` still
  // denies it to any embedded third-party frame.
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), payment=()'
  );

  // Strict-Transport-Security (HSTS) - only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
