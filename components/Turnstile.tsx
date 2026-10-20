'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  action?: string;
  className?: string;
}

// How long to wait for the Turnstile script to load before giving up.
// A blocked host (content blocker, iCloud Private Relay, Lockdown Mode) can
// otherwise leave the load promise pending forever with no user feedback.
const SCRIPT_LOAD_TIMEOUT_MS = 10000;

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: ((err?: Error) => void)[] = [];

function settleCallbacks(err?: Error) {
  loadCallbacks.forEach((cb) => cb(err));
  loadCallbacks.length = 0;
}

function loadScript() {
  if (scriptLoaded) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    loadCallbacks.push((err) => (err ? reject(err) : resolve()));

    // A load is already in flight — this promise will settle with it.
    if (scriptLoading) return;
    scriptLoading = true;

    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;

    const timeout = setTimeout(() => {
      scriptLoading = false;
      settleCallbacks(new Error('Turnstile script load timed out'));
    }, SCRIPT_LOAD_TIMEOUT_MS);

    script.onload = () => {
      clearTimeout(timeout);
      scriptLoaded = true;
      scriptLoading = false;
      settleCallbacks();
    };
    script.onerror = () => {
      clearTimeout(timeout);
      scriptLoading = false;
      // Allow a later mount to retry by re-appending a fresh script.
      script.remove();
      settleCallbacks(new Error('Turnstile script failed to load'));
    };

    document.head.appendChild(script);
  });
}

export default function Turnstile({
  siteKey,
  onToken,
  onExpire,
  onError,
  action,
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    loadScript()
      .then(() => {
        if (!mounted || !containerRef.current || !window.turnstile) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => onError?.(),
          action,
          appearance: 'always',
        });
      })
      .catch(() => {
        if (mounted) onError?.();
      });

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  return <div ref={containerRef} className={className} />;
}

export function useTurnstile(siteKey: string | undefined, action?: string) {
  const [resolvedSiteKey, setResolvedSiteKey] = useState(siteKey);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);

  useEffect(() => {
    if (siteKey) {
      setResolvedSiteKey(siteKey);
      return;
    }

    const controller = new AbortController();

    fetch('/api/config/turnstile', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Turnstile configuration is unavailable');
        }

        const body = (await response.json()) as { siteKey?: unknown };
        if (typeof body.siteKey !== 'string' || !body.siteKey) {
          throw new Error('Turnstile site key is missing');
        }

        setResolvedSiteKey(body.siteKey);
      })
      .catch((fetchError: unknown) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        ) {
          return;
        }
        setError(true);
      });

    return () => controller.abort();
  }, [siteKey]);

  const reset = useCallback(() => {
    setToken(null);
    setError(false);
    setWidgetKey((value) => value + 1);
  }, []);

  const handleToken = useCallback((value: string) => {
    setError(false);
    setToken(value);
  }, []);

  const handleError = useCallback(() => {
    setToken(null);
    setError(true);
  }, []);

  const handleExpire = useCallback(() => {
    setToken(null);
  }, []);

  const Widget = resolvedSiteKey ? (
    <Turnstile
      key={widgetKey}
      siteKey={resolvedSiteKey}
      onToken={handleToken}
      onExpire={handleExpire}
      onError={handleError}
      action={action}
    />
  ) : null;

  return { token, error, reset, Widget };
}
