import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Business setup | Pana Mia Club',
  robots: { index: false, follow: false },
};

export default function ListingSetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
