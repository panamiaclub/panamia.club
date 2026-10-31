import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { BUSINESS_INTAKE_SOURCE } from './profile-owners';

/** Public auth metadata is not trusted to supply a business name or owner. */
export async function listingSetupEmailContext(
  email: string,
  profileId: string
) {
  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.pendingOwnerEmail, email.trim().toLowerCase()),
      isNull(profiles.userId),
      sql`${profiles.status}->>'source' = ${BUSINESS_INTAKE_SOURCE}`
    ),
    columns: { id: true, name: true },
  });
  return profile ?? null;
}
