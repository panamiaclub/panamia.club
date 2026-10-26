import type { Metadata } from 'next';
import { CompactFeedMock } from './_components/compact-feed-mock';

export const metadata: Metadata = {
  title: 'Compact feed (mock) | Pana Social',
  robots: { index: false, follow: false },
};

export default function CompactFeedMockPage() {
  return <CompactFeedMock />;
}
