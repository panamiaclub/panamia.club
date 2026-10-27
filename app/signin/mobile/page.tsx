import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MobileSignInView } from '../_components/mobile-signin-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in to the Pana Mia app',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function MobileSignInPage() {
  return (
    <Suspense>
      <MobileSignInView />
    </Suspense>
  );
}
