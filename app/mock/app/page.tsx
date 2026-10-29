import type { Metadata } from 'next';
import { AppMock } from './_components/app-mock';

export const metadata: Metadata = {
  title: 'Four-tab app preview | Pana Mia',
  robots: { index: false, follow: false },
};

export default function MockAppPage() {
  return <AppMock />;
}
