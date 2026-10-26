'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyActor } from '@/lib/query/social';
import { Users, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface SocialEligibilityGateProps {
  children: React.ReactNode;
}

export function SocialEligibilityGate({
  children,
}: SocialEligibilityGateProps) {
  const { data, isLoading, isError, error, isFetching, refetch } = useMyActor();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  // The eligibility check itself failed. A backend/network fault is NOT the
  // same as "your account can't use social features", so offer a retry rather
  // than the confident-but-wrong "Social Features Unavailable" dead end below.
  if (isError || (data?.eligible && data.screenname && !data.actor)) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full">
            <AlertCircle className="text-destructive h-6 w-6" />
          </div>
          <CardTitle>Couldn&apos;t Load Social Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            We couldn&apos;t check your social account just now. This is usually
            temporary.
          </p>
          {error?.message && (
            <p className="text-muted-foreground font-mono text-xs break-words">
              {error.message}
            </p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // User has an actor - show children
  if (data?.actor) {
    return <>{children}</>;
  }

  // Eligible profiles with a handle are provisioned by the actor endpoint.
  if (data?.eligible) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <div className="bg-primary/10 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full">
            <Users className="text-primary h-6 w-6" />
          </div>
          <CardTitle>Choose Your Handle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center">
            Social features are available automatically. Choose a handle on your
            profile to post updates and follow other members.
          </p>
          <Button asChild className="w-full">
            <Link href="/account/profile/edit">Choose Your Handle</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // User is not eligible
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
          <AlertCircle className="h-6 w-6 text-yellow-600" />
        </div>
        <CardTitle>Social Features Unavailable</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground">
          {data?.reason ||
            'Your account is not yet eligible for social features.'}
        </p>
        <p className="text-muted-foreground text-sm">
          This may be because your profile is still being verified or you need
          to complete your profile setup.
        </p>
        <Button variant="outline" asChild className="w-full">
          <Link href="/account/profile/edit">Complete Your Profile</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
