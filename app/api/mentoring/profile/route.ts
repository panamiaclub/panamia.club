import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { ProfileMentoring } from '@/lib/interfaces';

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      enabled,
      expertise,
      languages,
      bio,
      videoIntroUrl,
      goals,
      hourlyRate,
    } = body;

    // Validate required fields
    if (!Array.isArray(expertise) || expertise.length === 0) {
      return NextResponse.json(
        { error: 'At least one expertise area is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(languages) || languages.length === 0) {
      return NextResponse.json(
        { error: 'At least one language is required' },
        { status: 400 }
      );
    }

    if (!bio || bio.length < 10) {
      return NextResponse.json(
        { error: 'Bio must be at least 10 characters' },
        { status: 400 }
      );
    }

    const mentoringData: ProfileMentoring = {
      enabled,
      expertise,
      languages,
      bio,
      videoIntroUrl: videoIntroUrl || '',
      goals: goals || '',
      hourlyRate: hourlyRate || 0,
    };

    const [profile] = await db
      .update(profiles)
      .set({ mentoring: mentoringData as unknown as Record<string, unknown> })
      .where(eq(profiles.userId, session.user.id))
      .returning({ mentoring: profiles.mentoring });

    if (!profile) {
      return NextResponse.json(
        { error: 'Create your personal profile before enabling mentoring.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mentoring: profile.mentoring,
    });
  } catch (error) {
    console.error('Error updating mentoring profile:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: `Failed to update profile: ${errorMessage}` },
      { status: 500 }
    );
  }
}
