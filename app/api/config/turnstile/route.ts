import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return NextResponse.json(
      { error: 'Turnstile is not configured' },
      { status: 503, headers: NO_STORE }
    );
  }

  return NextResponse.json({ siteKey }, { headers: NO_STORE });
}
