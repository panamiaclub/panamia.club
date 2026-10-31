import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sendTemplateEmail } from '@/lib/email';
import { profileOwners, users, type profiles } from '@/lib/schema';

type ListingForEmail = Pick<
  typeof profiles.$inferSelect,
  'id' | 'email' | 'userId' | 'pendingOwnerEmail'
>;

type ListingNotificationTemplate =
  'profile.submitted' | 'profile.published' | 'profile.not_published';

export async function listingNotificationRecipients(
  profile: ListingForEmail
): Promise<string[]> {
  const [linkedUser, owners] = await Promise.all([
    profile.userId
      ? db.query.users.findFirst({
          where: eq(users.id, profile.userId),
          columns: { email: true },
        })
      : Promise.resolve(null),
    db
      .select({ email: users.email, role: profileOwners.role })
      .from(profileOwners)
      .innerJoin(users, eq(users.id, profileOwners.userId))
      .where(eq(profileOwners.profileId, profile.id)),
  ]);

  const addresses = [
    linkedUser?.email,
    ...owners
      .filter((owner) => owner.role === 'owner')
      .map((owner) => owner.email),
    // An answered or superseded invitation must not keep receiving copies.
    !profile.userId && owners.length === 0 ? profile.pendingOwnerEmail : null,
    profile.email,
  ];
  return [
    ...new Set(
      addresses.flatMap((address) => {
        const normalized = address?.trim().toLowerCase();
        return normalized ? [normalized] : [];
      })
    ),
  ];
}

/** Application emails only: private sign-in links never use these recipients. */
export async function sendListingNotification(
  profile: ListingForEmail,
  template: ListingNotificationTemplate,
  params: Record<string, unknown>
): Promise<void> {
  const recipients = await listingNotificationRecipients(profile);
  if (recipients.length === 0) {
    throw new Error('The listing has no notification email address.');
  }
  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendTemplateEmail(template, params, recipient)
    )
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          new Error(`Listing notification failed for ${recipients[index]}`, {
            cause: result.reason,
          }),
        ]
      : []
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Some listing notification emails could not be sent.'
    );
  }
}
