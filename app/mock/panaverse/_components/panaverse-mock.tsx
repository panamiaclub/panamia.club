'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Globe, Lock, Sparkles } from 'lucide-react';
import {
  MOCK_MEMBER,
  SHARED_ROOMS,
  type MockSurface,
} from '../../_data/panaverse';
import { BrowserFrame } from '../../_components/browser-frame';
import { SurfaceMasthead } from '../../_components/surface-masthead';

/* Design mock for the panaverse chrome.
 *
 * The architecture question behind it: Pana Social is moving to its own
 * hostname, which means a member will cross an origin boundary mid-session.
 * Browsers make that crossing loud — the URL changes — while most apps make it
 * silent, and the mismatch is what makes a subdomain feel like a different
 * company. This mock takes the opposite bet: show the hostname, and make the
 * chrome carry enough continuity that crossing it is unremarkable.
 *
 * Hence the browser frame. A switcher mocked without a URL bar cannot be
 * judged, because the thing it has to survive is precisely the URL changing. */
export function PanaverseMock({ surfaces }: { surfaces: MockSurface[] }) {
  const [currentId, setCurrentId] = useState(
    surfaces.find((surface) => surface.id === 'social')?.id ?? surfaces[0].id
  );
  const current =
    surfaces.find((surface) => surface.id === currentId) ?? surfaces[0];

  return (
    <main className="surface-cream min-h-screen pb-20">
      <header
        className="scallop pt-12 pb-8"
        style={{ '--scallop': '#ffffff' } as CSSProperties}
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <span className="section-eyebrow">Panaverse</span>
              <h1 className="section-display mt-3 text-[clamp(2.25rem,5vw,3.5rem)]">
                Many rooms
                <br />
                <span className="display-accent">una sola casa</span>
              </h1>
              <p className="section-lede text-pana-ink/70 mt-3">
                Pana Social gets its own front door at{' '}
                <strong>social.panamia.club</strong>. This is the chrome that
                keeps it feeling like Pana Mia once it does — and the switcher
                that carries you between the rooms.
              </p>
            </div>

            <div className="flex flex-none items-center gap-2">
              <span
                className="text-pana-indigo inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-widest uppercase"
                aria-hidden="true"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Mock
              </span>
              <div className="mock-switch">
                {surfaces.map((surface) => (
                  <button
                    key={surface.id}
                    type="button"
                    data-active={surface.id === currentId}
                    onClick={() => setCurrentId(surface.id)}
                  >
                    {surface.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-6xl px-4">
        {/* The frame. Everything inside it is the design under review; the
            chrome around it is a browser, drawn so the hostname is impossible
            to ignore while judging the masthead. */}
        <BrowserFrame hostname={current.hostname} path={current.rootPath}>
          <SurfaceMasthead
            surfaces={surfaces}
            current={current}
            onSelect={setCurrentId}
          />
          <SurfaceBody current={current} />
        </BrowserFrame>

        <p className="text-pana-ink/55 mt-4 text-[13px] font-bold">
          Switch surfaces above, or open the switcher inside the frame — both
          drive the same state, including the address bar.
        </p>

        <ArchitectureNotes />

        <p className="border-pana-ink/10 text-pana-ink/55 mt-14 border-t pt-6 text-[13px] font-bold">
          Design mock at <code>/mock/panaverse</code>. The surfaces are read
          from <code>lib/panaverse/surfaces.ts</code> — the same registry the
          Worker routes hostnames on — so this page cannot claim a surface that
          does not exist. Pairs with{' '}
          <Link href="/mock/feed" className="link-arrow text-pana-indigo">
            /mock/feed
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </main>
  );
}

/* Enough of the page beneath the masthead to judge the chrome against real
   content weight. Deliberately low-fidelity — the surfaces themselves are
   designed in /mock/feed and /mock/profile, and redrawing them here would
   invite review of the wrong thing. */
function SurfaceBody({ current }: { current: MockSurface }) {
  const isSocial = current.id === 'social';

  return (
    <div className="panaverse-body">
      <div className="min-w-0 flex-1">
        <p className="section-eyebrow text-[11px]">
          {isSocial ? 'My feed' : 'Directory'}
        </p>
        <p className="panaverse-body-title">
          {isSocial ? 'de mi gente' : 'Find your Panas'}
        </p>
        <div className="panaverse-skeleton" aria-hidden="true">
          <span style={{ width: '92%' }} />
          <span style={{ width: '100%' }} />
          <span style={{ width: '78%' }} />
          <span style={{ width: '96%' }} />
          <span style={{ width: '85%' }} />
        </div>
      </div>

      <div className="panaverse-skeleton-rail" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/* The architecture, stated in the same place as the design it produced. These
   are the three decisions the chrome encodes, and each one was a fork where
   the obvious choice was the wrong one. */
function ArchitectureNotes() {
  return (
    <div className="mt-12 grid gap-4 md:grid-cols-3">
      <NoteCard
        icon={<Globe className="h-4 w-4" aria-hidden="true" />}
        title="One account, three domains"
      >
        A session cookie scoped to <code>.panamia.club</code> covers the main
        site and every surface under it. It cannot reach{' '}
        <code>panamia.club</code> — a different registrable domain — which is why
        the handles live there and the UI does not.
      </NoteCard>

      <NoteCard
        icon={<Lock className="h-4 w-4" aria-hidden="true" />}
        title="Handles outlive hostnames"
      >
        <code>{MOCK_MEMBER.fediverseHandle}</code> stays put no matter where the
        UI moves. Remote servers store actor URIs as permanent keys, so the
        identity domain is pinned separately from the host that serves the app.
      </NoteCard>

      <NoteCard
        icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        title="Rooms become surfaces"
      >
        {SHARED_ROOMS.length} parts of Pana Mia still exist as routes without a
        front door of their own. Promoting <code>{SHARED_ROOMS[0].path}</code>{' '}
        to <code>{SHARED_ROOMS[0].couldBecome}</code> is a registry entry plus a
        DNS record — not a second application to maintain. Events was listed
        here until recently and is now a surface in its own right, served at{' '}
        <code>panamia.club/e</code>, which is what that promotion costs in
        practice: the registry entry did the work, and the DNS record turned out
        to be optional.
      </NoteCard>
    </div>
  );
}

function NoteCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="feed-module">
      <p className="feed-module-title text-pana-indigo flex items-center gap-2">
        {icon}
        {title}
      </p>
      <p className="text-pana-ink/70 mt-2 text-[13px] leading-snug font-medium">
        {children}
      </p>
    </div>
  );
}
