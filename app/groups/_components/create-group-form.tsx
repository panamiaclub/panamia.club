'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Lock, Globe } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useCreateGroup } from '@/lib/query/social';
import {
  INPUT_CLASS,
  JOIN_OPTIONS,
  MAX_NAME,
  MAX_SUMMARY,
  MAX_TOPICS,
  VISIBILITY_OPTIONS,
  Field,
  RadioField,
} from '@/components/social/group-form-fields';
import type {
  SocialGroupJoinPolicy,
  SocialGroupVisibility,
} from '@/lib/schema';

/* Handle rules are this form's alone -- a group's handle is set once, at
   creation, and the edit surface deliberately cannot change it. */
const MAX_HANDLE = 24;
const MIN_HANDLE = 3;

/**
 * Turn a group's name into a usable handle.
 *
 * Only ever fills a handle the member has not typed in themselves -- see the
 * `handleTouched` flag. Silently rewriting a handle somebody chose because
 * they later edited the name is the kind of "help" that loses work.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_HANDLE);
}

/**
 * The form behind /groups/new.
 *
 * Asks for the name first and derives the handle from it, because the name is
 * the thing the founder already has in their head; the handle is plumbing they
 * would otherwise have to invent before they could describe what they are
 * making.
 */
export function CreateGroupForm() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const create = useCreateGroup();

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [summary, setSummary] = useState('');
  const [topics, setTopics] = useState('');
  const [visibility, setVisibility] = useState<SocialGroupVisibility>('public');
  const [joinPolicy, setJoinPolicy] = useState<SocialGroupJoinPolicy>('open');

  const effectiveHandle = handleTouched ? handle : slugify(name);

  const handleTooShort =
    effectiveHandle.length > 0 && effectiveHandle.length < MIN_HANDLE;

  const canSubmit =
    name.trim().length > 0 &&
    effectiveHandle.length >= MIN_HANDLE &&
    !create.isPending;

  if (status === 'loading') {
    return (
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="bg-pana-ink/10 h-10 rounded-xl" />
        <div className="bg-pana-ink/10 h-24 rounded-2xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="border-pana-ink/10 space-y-2 rounded-2xl border bg-white p-6">
        <p className="text-pana-ink text-[15px] font-extrabold">
          Sign in to start a group
        </p>
        <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
          A group needs a founding admin, and that is an account.
        </p>
        <Link
          href="/signin"
          className="bg-pana-ink mt-1 inline-flex rounded-full px-4 py-2 text-[13px] font-extrabold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    let created;
    try {
      created = await create.mutateAsync({
        handle: effectiveHandle,
        name: name.trim(),
        summary: summary.trim() || undefined,
        topics: topics
          .split(',')
          .map((topic) => topic.trim())
          .filter(Boolean)
          .slice(0, MAX_TOPICS),
        visibility,
        joinPolicy,
      });
    } catch {
      /* The rejection is already rendered from the mutation's own error state
         -- swallow it here so it does not surface as an unhandled rejection.
         A taken handle is an ordinary answer, not a crash. */
      return;
    }

    // The handle is what the group is reachable by, and the server normalises
    // the one we sent -- follow its answer rather than our input.
    router.push(`/g/${created.actor.username ?? effectiveHandle}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Field label="Name" hint="What people will call it.">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME}
          required
          placeholder="Miami Zine Club"
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        label="Handle"
        hint={`Its address: panamia.club/g/${effectiveHandle || 'your-group'}. Letters, numbers, dashes. ${MIN_HANDLE}–${MAX_HANDLE} characters.`}
        error={handleTooShort ? `At least ${MIN_HANDLE} characters.` : null}
      >
        <input
          type="text"
          value={effectiveHandle}
          onChange={(event) => {
            setHandleTouched(true);
            setHandle(event.target.value.toLowerCase());
          }}
          maxLength={MAX_HANDLE}
          required
          placeholder="miami-zine-club"
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Description" hint="Optional. What is this group for?">
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={MAX_SUMMARY}
          rows={3}
          placeholder="We trade zines, run swaps, and print together once a month."
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>

      <Field
        label="Topics"
        hint={`Optional, comma separated. Up to ${MAX_TOPICS}. These are what people search by.`}
      >
        <input
          type="text"
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
          placeholder="zines, printmaking, diy"
          className={INPUT_CLASS}
        />
      </Field>

      <RadioField
        legend="Who can read it"
        name="visibility"
        options={VISIBILITY_OPTIONS}
        value={visibility}
        onChange={setVisibility}
        icons={{ public: Globe, private: Lock }}
      />

      <RadioField
        legend="Who can join"
        name="joinPolicy"
        options={JOIN_OPTIONS}
        value={joinPolicy}
        onChange={setJoinPolicy}
      />

      {create.isError && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700"
        >
          {create.error.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-pana-ink inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-extrabold text-white disabled:opacity-40"
        >
          {create.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {create.isPending ? 'Starting…' : 'Start group'}
        </button>
        <Link
          href="/groups"
          className="text-pana-ink/60 inline-flex items-center gap-1.5 text-[13px] font-bold"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to groups
        </Link>
      </div>
    </form>
  );
}
