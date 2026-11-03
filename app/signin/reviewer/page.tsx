import type { Metadata } from 'next';
import Link from 'next/link';
import { ReviewerSignInForm } from './reviewer-signin-form';

export const metadata: Metadata = {
  title: 'App reviewer sign-in | Pana Mia',
  robots: { index: false, follow: false },
};

export default function ReviewerSignInPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-6 py-12">
      <h1 className="text-3xl font-bold">App reviewer sign-in</h1>
      <p className="text-muted-foreground text-sm">
        For authorized app reviewers. Use the dedicated credentials supplied in
        Play Console. This account does not have administrator access.
      </p>
      <ReviewerSignInForm />
      <p className="text-muted-foreground text-sm">
        Members should use{' '}
        <Link href="/signin" className="font-semibold underline">
          Google or an email sign-in link
        </Link>
        . By continuing, you agree to our{' '}
        <Link href="/legal/terms" className="underline">
          Terms of Service
        </Link>{' '}
        and can read our{' '}
        <Link href="/legal/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
