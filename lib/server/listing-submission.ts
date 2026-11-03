import { sendTemplateEmail } from '@/lib/email';
import type {
  ProfileDescriptions,
  ProfileSocialsInterface,
} from '@/lib/interfaces';
import type { profiles } from '@/lib/schema';
import type { ListingStatus } from './listing-decision';
import { sendListingNotification } from './listing-notifications';

export async function sendListingSubmissionEmails(
  profile: typeof profiles.$inferSelect,
  options: { setupReceiptEmail?: string } = {}
): Promise<void> {
  const status = profile.status as ListingStatus | null;
  const descriptions = profile.descriptions as ProfileDescriptions | null;
  const socials = profile.socials as ProfileSocialsInterface | null;
  if (!status?.access) {
    throw new Error('The listing has no review access key.');
  }

  const approveUrl = new URL(
    '/admin/profile/action',
    process.env.NEXT_PUBLIC_HOST_URL
  );
  approveUrl.searchParams.set('profileId', profile.id);
  approveUrl.searchParams.set('access', status.access);
  approveUrl.searchParams.set('action', 'approve');
  const declineUrl = new URL(approveUrl);
  declineUrl.searchParams.set('action', 'decline');

  const setupReceiptEmail = options.setupReceiptEmail?.trim().toLowerCase();
  const receipt = setupReceiptEmail
    ? profile.email.trim().toLowerCase() === setupReceiptEmail
      ? Promise.resolve()
      : sendTemplateEmail(
          'profile.submitted',
          { name: profile.name },
          profile.email
        )
    : sendListingNotification(profile, 'profile.submitted', {
        name: profile.name,
      });

  const results = await Promise.allSettled([
    sendTemplateEmail('admin.profile_submission', {
      name: profile.name,
      email: profile.email,
      details: descriptions?.details || '',
      phone_number: profile.phoneNumber || '',
      five_words: descriptions?.fiveWords || '',
      tags: descriptions?.tags || '',
      socials_website: socials?.website || 'n/a',
      socials_instagram: socials?.instagram || 'n/a',
      socials_facebook: socials?.facebook || 'n/a',
      socials_tiktok: socials?.tiktok || 'n/a',
      socials_twitter: socials?.twitter || 'n/a',
      socials_spotify: socials?.spotify || 'n/a',
      hearaboutus: descriptions?.hearaboutus || 'Public business intake form',
      affiliate: profile.affiliate || 'n/a',
      approve_url: approveUrl.toString(),
      decline_url: declineUrl.toString(),
    }),
    receipt,
  ]);
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Some listing submission emails could not be sent.'
    );
  }
}
