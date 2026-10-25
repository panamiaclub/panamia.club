import type { Metadata } from 'next';
import { ComposerMock } from './_components/composer-mock';

export const metadata: Metadata = {
  title: 'Post composer (mock) | Pana Social',
  robots: { index: false, follow: false },
};

export default function MockComposerPage() {
  return <ComposerMock />;
}
