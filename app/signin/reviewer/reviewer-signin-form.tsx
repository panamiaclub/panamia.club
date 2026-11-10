'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient, useIsHydrated } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReviewerSignInForm() {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        callbackURL: '/d',
      });
      if (result.error) {
        setError(
          result.error.message ||
            'Unable to sign in. Check your review credentials and try again.'
        );
        return;
      }
      setPassword('');
      router.replace('/d');
      router.refresh();
    } catch (failure) {
      console.error('[reviewer] sign-in request failed', {
        errorType: failure instanceof Error ? failure.name : typeof failure,
      });
      setError('Unable to reach sign-in. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reviewer-email">Review account email</Label>
        <Input
          id="reviewer-email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={!hydrated || pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reviewer-password">Review account password</Label>
        <Input
          id="reviewer-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          maxLength={128}
          disabled={!hydrated || pending}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!hydrated || pending}>
        {pending ? 'Signing in...' : 'Sign in for review'}
      </Button>
    </form>
  );
}
