'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function PortalButton() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/shop/portal', { method: 'POST' });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Portal could not be opened');
      }
      window.location.assign(result.url);
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
        className="bg-pana-ink text-pana-cream"
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
