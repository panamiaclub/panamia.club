import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { joinOpportunity } from '@/lib/connectors/opportunities';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json(
        { success: false, error: 'You need to be signed in.' },
        { status: 401 }
      );
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Could not read that request.' },
        { status: 400 }
      );
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !body.id.trim()
    ) {
      return NextResponse.json(
        { success: false, error: 'Which opportunity?' },
        { status: 400 }
      );
    }
    const result = await joinOpportunity(session.user.id, body.id);
    return result.ok
      ? NextResponse.json({ success: true, data: result.data })
      : NextResponse.json(
          { success: false, error: result.error },
          { status: result.status }
        );
  } catch (error) {
    console.error('Error joining connector opportunity:', error);
    return NextResponse.json(
      { success: false, error: 'Could not pick that up. Try again.' },
      { status: 500 }
    );
  }
}
