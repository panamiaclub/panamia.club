'use client';

/**
 * /account/social — safety settings for Pana Social.
 *
 * Lives under /account rather than on social.panamia.club because the Pana
 * account is shared across the panaverse: one login, one place to manage it.
 * The surfaces differ, the account does not.
 *
 * See docs/SOCIAL-GRAPH.md section B.
 */

import { useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { BlockedAccountsSettings } from '@/components/social';
import { Loader2 } from 'lucide-react';

export default function AccountSocialSafetyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/signin?callbackUrl=/account/social');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (status !== 'authenticated' || !session) return null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Safety</h1>

      <Card>
        <CardContent className="pt-6">
          <BlockedAccountsSettings />
        </CardContent>
      </Card>
    </div>
  );
}
