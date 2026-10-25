import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { opportunityInputSchema } from '@/lib/connectors/opportunities-model';
import {
  saveOpportunity,
  setOpportunityClosed,
} from '@/lib/connectors/opportunities';

async function write(request: NextRequest, editing: boolean) {
  try {
    const admin = await checkAdminAuth();
    if (!admin)
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Send the opportunity details.' },
        { status: 400 }
      );
    }
    const id =
      'id' in body && typeof body.id === 'string' ? body.id : undefined;
    if (editing && !id)
      return NextResponse.json(
        { success: false, error: 'Which opportunity?' },
        { status: 400 }
      );
    if (editing && id && 'closed' in body && typeof body.closed === 'boolean') {
      const result = await setOpportunityClosed(id, body.closed);
      return result.ok
        ? NextResponse.json({ success: true, data: result.data })
        : NextResponse.json(
            { success: false, error: result.error },
            { status: result.status }
          );
    }
    const parsed = opportunityInputSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    const result = await saveOpportunity(
      parsed.data,
      admin.id,
      editing ? id : undefined
    );
    return result.ok
      ? NextResponse.json({ success: true, data: result.data })
      : NextResponse.json(
          { success: false, error: result.error },
          { status: result.status }
        );
  } catch (error) {
    console.error('Error saving connector opportunity:', error);
    return NextResponse.json(
      { success: false, error: 'Could not save that opportunity. Try again.' },
      { status: 500 }
    );
  }
}

export function POST(request: NextRequest) {
  return write(request, false);
}
export function PATCH(request: NextRequest) {
  return write(request, true);
}
