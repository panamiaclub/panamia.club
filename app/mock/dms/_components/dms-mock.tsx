'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import type { MockSurface } from '../../_data/panaverse';
import { SurfaceMasthead } from '../../_components/surface-masthead';
import { MailModel } from './mail-model';
import { ChatModel } from './chat-model';

type DmModel = 'mail' | 'chat';

/* Design mock for Pana Social direct messages, rendered as Pana Social.
 *
 * Two models, one switcher, identical fixtures. The switcher is in the mock
 * toolbar rather than in the product chrome on purpose: it is a question being
 * asked of Jose, not a setting a pana would ever see. Only one of these ships.
 *
 * Why this route exists: Pana Social has no DM feature, but it does have a
 * substrate - `visibility: 'direct'` statuses addressed through `recipientTo`,
 * two API routes, and a read-only list at /updates.
 * So the question is not "build DMs or not", it is "which shape does
 * the thing we already half-have grow into", and that is a product decision
 * best made by looking at both. */
export function DmsMock({ surfaces }: { surfaces: MockSurface[] }) {
  const router = useRouter();
  const [model, setModel] = useState<DmModel>('mail');

  const current =
    surfaces.find((surface) => surface.id === 'social') ?? surfaces[0];

  return (
    <main className="surface-cream min-h-screen pb-20">
      <div className="mock-toolbar">
        <span className="mock-toolbar-badge">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Mock
        </span>

        <span className="mock-toolbar-host">
          <Lock className="h-3 w-3 flex-none" aria-hidden="true" />
          {current.hostname}
        </span>

        <div className="mock-switch ml-auto">
          <button
            type="button"
            data-active={model === 'mail'}
            onClick={() => setModel('mail')}
          >
            Mail model
          </button>
          <button
            type="button"
            data-active={model === 'chat'}
            onClick={() => setModel('chat')}
          >
            Chat model
          </button>
        </div>

        <Link href="/mock/feed" className="mock-toolbar-link">
          Feed
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <SurfaceMasthead
        surfaces={surfaces}
        current={current}
        onSelect={(id) => {
          if (id !== current.id) router.push('/mock/panaverse');
        }}
        sticky
        contained
      />

      <div className="container mx-auto max-w-6xl px-4 pt-8">
        <header className="mb-6">
          <h1 className="text-pana-ink text-3xl font-black tracking-tight">
            Messages
          </h1>
          <p className="text-pana-ink/65 mt-1 max-w-3xl text-sm leading-snug font-medium">
            {model === 'mail'
              ? 'Mail model — threads built on the direct statuses we already store, replies walked through inReplyToId. Nothing new stored.'
              : 'Chat model — realtime rooms on Durable Objects, a chat_messages table, and an authenticated websocket.'}
          </p>
        </header>

        {model === 'mail' ? <MailModel /> : <ChatModel />}

        <ModelNotes model={model} />
      </div>
    </main>
  );
}

/* The trade-off, written down next to the thing it describes so the comparison
   is not purely aesthetic. Both columns are shown whichever model is active,
   with the inactive one dimmed - hiding the other side would let whichever
   model is on screen look free. */
function ModelNotes({ model }: { model: DmModel }) {
  return (
    <section className="mt-10 grid gap-4 md:grid-cols-2">
      <NoteCard
        title="Mail"
        active={model === 'mail'}
        gains={[
          'Ships on the schema we already have — direct statuses, recipientTo, inReplyToId.',
          'Federates. A DM to a Mastodon account works, because this is how Mastodon DMs already work.',
          'Inherits the block filtering from #258 with no new surface to audit.',
          'Async by design, which suits panas who are not sitting in an app.',
        ]}
        costs={[
          'No realtime. A reply appears on refresh or poll.',
          'Threads are derived by walking reply chains, not stored.',
          'Does not answer the group-rooms want at all.',
          'Reads as dated to anyone expecting iMessage.',
        ]}
      />
      <NoteCard
        title="Chat"
        active={model === 'chat'}
        gains={[
          'Matches what people expect a DM to be in 2026.',
          'Presence, typing, and read state are possible rather than pretended.',
          'The same Durable Object gets you group rooms, which CHAT-ROADMAP wants anyway.',
          'Rapid back-and-forth stops feeling like filing paperwork.',
        ]}
        costs={[
          'New infrastructure: chat_messages, a DO class, authenticated /ws upgrade.',
          'Does not federate. CHAT-ROADMAP assumes it never will.',
          'Two parallel DM systems unless the direct-status path is retired.',
          'Block, mute, and report all need re-implementing against a second store.',
          'Moderation gets harder: a transcript is not a status, so nothing we built applies.',
        ]}
      />
    </section>
  );
}

function NoteCard({
  title,
  active,
  gains,
  costs,
}: {
  title: string;
  active: boolean;
  gains: string[];
  costs: string[];
}) {
  return (
    <div
      className={`rounded-[1.125rem] border-2 p-5 transition-opacity ${
        active
          ? 'border-pana-indigo/35 bg-white'
          : 'border-pana-ink/14 bg-white/50 opacity-65'
      }`}
    >
      <h2 className="text-pana-ink text-[13px] font-extrabold tracking-[0.1em] uppercase">
        {title}
      </h2>
      <ul className="mt-3 space-y-1.5">
        {gains.map((item) => (
          <li
            key={item}
            className="text-pana-ink/80 flex gap-2 text-[13px] leading-snug font-medium"
          >
            <span
              aria-hidden="true"
              className="text-pana-indigo flex-none font-black"
            >
              +
            </span>
            {item}
          </li>
        ))}
        {costs.map((item) => (
          <li
            key={item}
            className="text-pana-ink/60 flex gap-2 text-[13px] leading-snug font-medium"
          >
            <span
              aria-hidden="true"
              className="text-pana-red flex-none font-black"
            >
              −
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
