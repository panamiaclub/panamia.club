import Link from 'next/link';
import { desc, eq, or } from 'drizzle-orm';

import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { PortalButton } from '@/components/shop/portal-button';
import { db } from '@/lib/db';
import { commerceSubscriptions } from '@/lib/schema';

export default async function ShopAccountPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return (
      <main className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-black">Manage your membership</h1>
        <p className="text-pana-ink/65 mx-auto mt-3 max-w-xl">
          Sign in using the same email used at checkout to update payment
          details or cancel a subscription.
        </p>
        <Button asChild className="mt-7">
          <Link href="/signin?callbackUrl=/shop/account">Sign in</Link>
        </Button>
      </main>
    );
  }

  const subscriptions = await db.query.commerceSubscriptions.findMany({
    where: or(
      eq(commerceSubscriptions.userId, session.user.id),
      eq(commerceSubscriptions.email, session.user.email.toLowerCase())
    ),
    orderBy: desc(commerceSubscriptions.updatedAt),
  });

  return (
    <main className="container mx-auto px-4 py-14">
      <div className="mx-auto max-w-3xl">
        <p className="text-pana-burnt-deep text-sm font-black tracking-widest uppercase">
          Membership
        </p>
        <h1 className="mt-2 text-4xl font-black">Subscription settings</h1>
        {subscriptions.length === 0 ? (
          <div className="border-pana-ink/15 mt-8 rounded-2xl border border-dashed p-8">
            <h2 className="text-xl font-black">No subscription found.</h2>
            <p className="text-pana-ink/65 mt-2">
              The purchase must use the same email as this account.
            </p>
          </div>
        ) : (
          <div className="border-pana-ink/10 mt-8 rounded-2xl border bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="text-sm font-bold tracking-widest uppercase">
                  Latest status
                </p>
                <p className="mt-1 text-2xl font-black capitalize">
                  {subscriptions[0].status.replaceAll('_', ' ')}
                </p>
                {subscriptions[0].currentPeriodEnd && (
                  <p className="text-pana-ink/65 mt-1 text-sm">
                    Current period ends{' '}
                    {subscriptions[0].currentPeriodEnd.toLocaleDateString()}
                  </p>
                )}
              </div>
              <PortalButton />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
