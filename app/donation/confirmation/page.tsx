'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Heart } from 'lucide-react';

function DonationConfirmationContent() {
  const searchParams = useSearchParams();
  const tier = searchParams?.get('tier')
    ? parseInt(searchParams.get('tier')!)
    : 0;
  const _amt = searchParams?.get('amt')
    ? parseInt(searchParams.get('amt')!)
    : 0;
  const frequency = searchParams?.get('frequency');
  const isRecurring = frequency === 'monthly' || (!frequency && tier > 0);

  return (
    <div className="from-background to-muted/20 flex min-h-screen flex-col bg-gradient-to-b">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        {/* Success Icon */}
        <div className="mb-8 flex justify-center">
          <div className="rounded-full bg-green-100 p-6 dark:bg-green-900/20">
            <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-4 text-4xl font-bold">Muchísimas Gracias!</h1>
          <h2 className="text-muted-foreground text-2xl">
            {isRecurring
              ? tier > 0
                ? 'Thank you so much for becoming a Gente dePana!'
                : 'Thank you so much for your monthly support!'
              : 'Thank you so much for your contribution!'}
          </h2>
        </div>

        {/* Confirmation Content */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="text-pana-pink h-6 w-6" aria-hidden="true" />
              Your Support Makes a Difference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRecurring && tier > 0 && (
              <div className="bg-pana-blue/10 rounded-lg p-4">
                <p className="text-sm">
                  You will be receiving a confirmation email from us soon with
                  your monthly donation amount and the perks associated with
                  your subscription. These features should be activated in your
                  account shortly.
                </p>
              </div>
            )}

            <p className="text-lg font-medium">
              Your support makes all the difference in our ability to reach and
              support the local South Florida community. Your generosity helps
              us achieve our vision!
            </p>

            <p className="text-muted-foreground">
              If you have any questions or comments, please feel free to contact
              us at{' '}
              <Link
                href="mailto:gentede@panamia.club"
                className="text-pana-blue hover:underline"
              >
                gentede@panamia.club
              </Link>
            </p>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button size="lg" asChild>
            <Link href="/">Return to Home</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/directory/search">Explore Directory</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DonationConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground text-lg">Loading...</p>
        </div>
      }
    >
      <DonationConfirmationContent />
    </Suspense>
  );
}
