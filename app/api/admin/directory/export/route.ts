import { NextResponse } from 'next/server';
import { businessCsv } from '@/lib/admin/directory';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getDirectoryRoster } from '@/lib/server/admin-directory';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  try {
    const { businesses, asOf } = await getDirectoryRoster();
    return new Response(`\uFEFF${businessCsv(businesses)}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="directory-businesses-${asOf.slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to export directory businesses', error);
    return NextResponse.json(
      { error: 'Could not export directory businesses. Please try again.' },
      { status: 500 }
    );
  }
}
