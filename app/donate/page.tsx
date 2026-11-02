import type { Metadata } from 'next';
import { DonationExperience } from '@/components/donations/donation-experience';
import { parseDonationReturn } from '@/lib/donations';

export const metadata: Metadata = {
  title: 'Give local | Pana MIA',
  description:
    'Support local culture, community technology, and a more connected South Florida with a one-time or monthly gift to Pana MIA.',
};

export default async function DonatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <DonationExperience
      initialGift={parseDonationReturn(params)}
      checkoutCanceled={params.canceled === '1'}
    />
  );
}
