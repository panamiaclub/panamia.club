'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { readListingInvitationFragment } from '@/lib/listing-invitation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function StopReminders() {
  const params = useSearchParams();
  const cycleId = params?.get('cycleId');
  const token = useRef<string | null>(null);
  const capturedFor = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (window.location.hash)
      token.current = readListingInvitationFragment(window.location.hash);
    else if (capturedFor.current !== cycleId) token.current = null;
    capturedFor.current = cycleId ?? null;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    setReady(true);
  }, [cycleId]);
  async function stop() {
    if (!cycleId || !token.current) {
      setError('Open the original stop-reminders link from your email.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/listings/review/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId, token: token.current, action: 'stop' }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true)
        throw new Error(data.error || 'Could not stop reminders.');
      token.current = null;
      setStopped(true);
    } catch (cause) {
      console.error('[listing-reminders] preference could not be saved');
      setError(
        cause instanceof Error ? cause.message : 'Could not stop reminders.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="auth-surface px-4 py-16">
      <Card className="mx-auto max-w-lg rounded-2xl">
        <CardContent className="space-y-5 p-8">
          <h1 className="text-2xl font-black">
            {stopped
              ? 'Listing reminders stopped'
              : 'Stop listing-review reminders?'}
          </h1>
          <p>
            {stopped
              ? 'Your preference was recorded. This does not claim or restore a hidden business.'
              : 'Opening this page changes nothing. Confirm below to stop review reminders for this listing. A staff member can follow up separately; opting out is not treated as ignoring the messages.'}
          </p>
          {!stopped && (
            <Button
              onClick={stop}
              disabled={!ready || saving}
              className="w-full rounded-full font-extrabold"
            >
              {saving ? 'Saving...' : 'Confirm stop reminders'}
            </Button>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
export default function StopListingRemindersPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <StopReminders />
    </Suspense>
  );
}
