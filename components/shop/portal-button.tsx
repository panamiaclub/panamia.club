'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function PortalButton({
  endpoint = '/api/shop/portal',
  customerId,
  className = 'bg-pana-ink text-pana-cream',
}: {
  endpoint?: string;
  customerId?: string;
  className?: string;
}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        ...(customerId
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customerId }),
            }
          : {}),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          result &&
            typeof result === 'object' &&
            'error' in result &&
            typeof result.error === 'string'
            ? result.error
            : 'Portal could not be opened'
        );
      }
      if (
        !result ||
        typeof result !== 'object' ||
        !('url' in result) ||
        typeof result.url !== 'string'
      ) {
        throw new Error('Portal could not be opened');
      }
      const url = new URL(result.url);
      if (url.protocol !== 'https:') {
        throw new Error('Stripe did not return a secure billing URL');
      }
      window.location.assign(url.href);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Portal could not be opened'
      );
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className={className}
      >
        {loading ? 'Opening…' : 'Manage in Stripe'}
      </Button>
      {error && (
        <p role="alert" className="text-pana-red-deep mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
