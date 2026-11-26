import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getDirectoryRoster } from '@/lib/server/admin-directory';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  try {
    return NextResponse.json(await getDirectoryRoster(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Failed to load the directory roster', error);
    return NextResponse.json(
      { error: 'Could not load directory businesses. Please try again.' },
      { status: 500 }
    );
  }
}
