import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { and, ne, sql } from 'drizzle-orm';
import { ProfileMentoring } from '@/lib/interfaces';
import { notBusinessListing } from '@/lib/server/profile-owners';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const expertise = searchParams.get('expertise');
  const language = searchParams.get('language');
  const freeOnly = searchParams.get('freeOnly') === 'true';

  // Get all profiles with mentoring enabled and filter in JS
  const mentorProfiles = await db.query.profiles.findMany({
    where: and(
      ne(profiles.userId, session.user.id),
      notBusinessListing,
      sql`${profiles.mentoring}->>'enabled' = 'true'`
    ),
    columns: {
      id: true,
      name: true,
      email: true,
      mentoring: true,
      availability: true,
      primaryImageId: true,
      primaryImageCdn: true,
      galleryImages: true,
    },
    with: { user: { columns: { screenname: true, email: true } } },
    limit: 100,
  });

  // Filter by expertise, language, and hourly rate in JS
  let mentors = mentorProfiles.filter((p) => {
    const mentoring = p.mentoring as ProfileMentoring | null;
    if (!mentoring?.enabled) return false;

    if (expertise && !mentoring.expertise?.includes(expertise)) return false;
    if (language && !mentoring.languages?.includes(language)) return false;
    if (freeOnly && (mentoring.hourlyRate ?? 0) > 0) return false;

    return true;
  });

  // Transform to expected format and limit
  const formattedMentors = mentors.slice(0, 50).map((p) => ({
    _id: p.id,
    id: p.id,
    name: p.name,
    email: p.user?.email,
    mentoring: p.mentoring,
    availability: p.availability,
    screenname: p.user?.screenname || null,
    images: {
      primary: p.primaryImageId,
      primaryCDN: p.primaryImageCdn,
      ...((p.galleryImages as object) || {}),
    },
  }));

  return NextResponse.json({ mentors: formattedMentors });
}
