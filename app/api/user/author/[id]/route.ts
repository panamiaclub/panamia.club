import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, profiles } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ deleted: true }, { status: 404 });
  }

  try {
    // Find user by ID
    const foundUser = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!foundUser) {
      return NextResponse.json({ deleted: true });
    }

    // Find associated profile if exists
    const userProfile = await db.query.profiles.findFirst({
      where: and(eq(profiles.userId, foundUser.id), eq(profiles.active, true)),
    });

    const verification = userProfile?.verification as {
      panaVerified?: boolean;
    } | null;

    return NextResponse.json({
      screenname: foundUser.screenname || null,
      verified: verification?.panaVerified || false,
    });
  } catch (error) {
    console.error('Author lookup error:', error);
    return NextResponse.json({ deleted: true }, { status: 500 });
  }
}
