/**
 * .well-known/privacy-policy
 *
 * Redirects to the privacy policy page.
 */

import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.redirect(
    new URL(
      '/legal/privacy',
      process.env.BETTER_AUTH_URL || 'https://panamia.club'
    ),
    302
  );
}
