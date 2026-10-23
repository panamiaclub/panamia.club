'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyActor, useEnableSocial } from '@/lib/query/social';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface SocialEligibilityGateProps {
  children: React.ReactNode;
}

export function SocialEligibilityGate({
  children,
}: SocialEligibilityGateProps) {
  const { data, isLoading, isError, error, isFetching, refetch } = useMyActor();
  const enableSocial = useEnableSocial();
  const { t } = useTranslation('toast');

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
  if (isError) {
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

  // User is eligible but hasn't enabled social yet
  if (data?.eligible) {
    const handleEnable = async () => {
      try {
        await enableSocial.mutateAsync();
        toast({
          title: t('socialEnabled'),
          description: t('socialEnabledDesc'),
        });
      } catch {
        toast({
          title: t('error'),
          description: t('socialEnableFailed'),
          variant: 'destructive',
        });
      }
    };

    const screenname = data.screenname;

    return (
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <div className="bg-primary/10 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full">
            <Users className="text-primary h-6 w-6" />
          </div>
          <CardTitle>Enable Social Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center">
            Post updates, follow others, and join the conversation.
          </p>

          {screenname && (
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-muted-foreground mb-1 text-sm">
                Your social handle will be:
              </p>
              <p className="font-mono font-medium">@{screenname}</p>
            </div>
          )}

          <div className="bg-muted/30 flex gap-3 rounded-lg border p-3">
            <Info className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="text-muted-foreground text-sm">
              Your social handle is based on your profile screenname and{' '}
              <strong className="text-foreground">cannot be changed</strong>{' '}
              once enabled. To use a different handle,{' '}
              <Link
                href="/account/user/edit#identity"
                className="hover:text-foreground underline"
              >
                update your screenname
              </Link>{' '}
              before enabling social features.
            </p>
          </div>

          <Button
            onClick={handleEnable}
            disabled={enableSocial.isPending}
            className="w-full"
          >
            {enableSocial.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Enable Social Features
              </>
            )}
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
          <Link href="/account/user/edit#profile">Complete Your Profile</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
