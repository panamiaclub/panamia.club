import type { Metadata } from 'next';
import { OnlineDirectory } from './_components/online-directory';

export const metadata: Metadata = {
  title: 'Mock - online businesses on the map',
  robots: { index: false, follow: false },
};

export default function OnlineDirectoryMockPage() {
  return <OnlineDirectory />;
}
