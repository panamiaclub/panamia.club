import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ClearShopCart } from '@/components/shop/clear-cart';
import { getStripe } from '@/lib/shop/stripe';

export default async function ShopSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const sessionId = (await searchParams).session_id;
  const session = sessionId
    ? await getStripe()
        .checkout.sessions.retrieve(sessionId)
        .catch(() => null)
    : null;

  if (!session || session.payment_status === 'unpaid') {
    return (
      <main className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-black">
          We could not confirm the payment.
        </h1>
        <p className="text-pana-ink/65 mt-3">
          Your cart is still available. No successful payment is shown here.
        </p>
        <Button asChild className="mt-7">
          <Link href="/shop/cart">Return to cart</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-20 text-center">
      <ClearShopCart />
      <CheckCircle2
        aria-hidden
        className="text-pana-indigo mx-auto h-16 w-16"
      />
      <h1 className="mt-5 text-4xl font-black">Payment received.</h1>
      <p className="text-pana-ink/65 mx-auto mt-3 max-w-xl">
        A confirmation is being sent to{' '}
        <strong>{session.customer_details?.email ?? 'your email'}</strong>.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild className="bg-pana-ink text-pana-cream">
          <Link href="/shop">Continue shopping</Link>
        </Button>
        {session.mode === 'subscription' && (
          <Button asChild variant="outline">
            <Link href="/shop/account">Manage membership</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
