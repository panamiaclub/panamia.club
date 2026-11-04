import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateScreenname, isScreennameAvailable } from '@/lib/screenname';

export async function GET(request: NextRequest) {
  const searchParams = (request.nextUrl ?? new URL(request.url)).searchParams;
  const name = searchParams.get('name');

  if (!name) {
    return NextResponse.json(
      { available: false, error: 'Screenname parameter is required' },
      { status: 400 }
    );
  }

  // First validate format
  const formatResult = validateScreenname(name);
  if (!formatResult.valid) {
    return NextResponse.json({
      available: false,
      error: formatResult.error,
    });
  }

  const session = await auth();
  const available = await isScreennameAvailable(
    name,
    session?.user?.email?.toLowerCase()
  );

  return NextResponse.json(
    {
      available,
      error: available ? undefined : 'This screenname is already taken',
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
