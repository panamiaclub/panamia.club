import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { normalizeUsZip, US_ZIP_REQUIRED_MESSAGE } from '@/lib/online-zip';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }
  const zipCode = normalizeUsZip(
    body && typeof body === 'object' && 'zipCode' in body ? body.zipCode : null
  );
  if (!zipCode) {
    return NextResponse.json(
      { success: false, error: US_ZIP_REQUIRED_MESSAGE },
      { status: 400 }
    );
  }

  try {
    const [saved] = await db
      .update(users)
      .set({ zipCode, updatedAt: new Date() })
      .where(eq(users.id, session.user.id))
      .returning({ zipCode: users.zipCode });
    if (!saved) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('Error saving account ZIP code:', error);
    return NextResponse.json(
      { success: false, error: 'Could not save your ZIP code. Try again.' },
      { status: 500 }
    );
  }
}
