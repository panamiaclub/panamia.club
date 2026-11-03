import type { Metadata } from 'next';
import { DonationExperience } from '@/components/donations/donation-experience';

export const metadata: Metadata = {
  title: 'Give local (mock) | Pana MIA',
  description: 'A design preview of one-time and monthly giving for Pana MIA.',
  robots: { index: false, follow: false },
};

export default function MockDonatePage() {
  return <DonationExperience previewOnly />;
}
