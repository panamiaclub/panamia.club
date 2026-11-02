import type { Metadata } from 'next';
import { WelcomeFooterMock } from './_components/welcome-footer-mock';

export const metadata: Metadata = {
  title: 'Welcome footer (mock) | Pana Mia',
  robots: { index: false, follow: false },
};

export default function WelcomeFooterPage() {
  return <WelcomeFooterMock />;
}
