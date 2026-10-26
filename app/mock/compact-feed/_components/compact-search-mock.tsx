'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Check, Search, Sparkles, X } from 'lucide-react';
import { KIND_ICON } from '@/components/kind-icon';
import { SCOPE_TONE } from '@/lib/directory-scopes';
import {
  MOCK_MY_GROUPS,
  MOCK_POSTS,
  MOCK_VIEWER,
} from '../../feed/_data/mock-feed';

const SCOPES = [
  {
    id: 'panas',
    label: 'Panas',
    icon: KIND_ICON.pana,
    tone: SCOPE_TONE.pana,
    placeholder: 'Find a Pana...',
    heading: 'A few friendly faces',
  },
  {
    id: 'groups',
    label: 'Groups',
    icon: KIND_ICON.group,
    tone: SCOPE_TONE.group,
    placeholder: 'Find a group...',
    heading: 'Find your kind of people',
  },
  {
    id: 'events',
    label: 'Events',
    icon: KIND_ICON.event,
    tone: SCOPE_TONE.event,
    placeholder: 'Find an event...',
    heading: 'Make a little plan',
  },
  {
    id: 'directory',
    label: 'Directory',
    icon: KIND_ICON.directory,
    tone: SCOPE_TONE.directory,
    placeholder: 'Explore the directory...',
    heading: 'Good spots in the community',
  },
] as const;

type SearchScope = (typeof SCOPES)[number]['id'];
type SearchResult = {
  id: string;
  name: string;
  description: string;
  image: string;
};

const RESULTS: Record<SearchScope, SearchResult[]> = {
  panas: [
    ...new Map(
      MOCK_POSTS.filter(
        (post) => post.author.handle !== MOCK_VIEWER.handle
      ).map(({ author }) => [
        author.handle,
        {
          id: author.handle,
          name: author.name,
          description: `@${author.handle}${author.county ? ` - ${author.county}` : ''}`,
          image: author.avatar,
        },
      ])
    ).values(),
  ].slice(0, 3),
  groups: MOCK_MY_GROUPS.filter((group) => group.visibility === 'public')
    .slice(0, 3)
    .map((group) => ({
      id: group.id,
      name: group.name,
      description: `${group.memberCount} members - Public group`,
      image: group.avatar,
    })),
  events: [
    {
      id: 'print-night',
      name: 'Print night at the studio',
      description: 'Workshop - Little Haiti',
      image: '/img/impact/zine-series.webp',
    },
    {
      id: 'community-table',
      name: 'The community table',
      description: 'Meetup - Miami-Dade',
      image: '/img/impact/hero-mixer.webp',
    },
  ],
  directory: [
    {
      id: 'taller-tropical',
      name: 'Taller Tropical',
      description: 'Creative studio - Miami-Dade',
      image: '/img/impact/hero-mixer.webp',
    },
    {
      id: 'little-river-print',
      name: 'Little River Print Shop',
      description: 'Art and printing - Little River',
      image: '/img/impact/zine-series.webp',
    },
  ],
};

export function CompactSearchMock() {
  const [scope, setScope] = useState<SearchScope>('panas');
  const [term, setTerm] = useState('');
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const desktopRoot = useRef<HTMLDivElement>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const active = SCOPES.find((entry) => entry.id === scope)!;
  const results = RESULTS[scope].filter((result) =>
    `${result.name} ${result.description}`
      .toLowerCase()
      .includes(term.trim().toLowerCase())
  );

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !desktopRoot.current?.contains(event.target)
      ) {
        setDesktopOpen(false);
      }
    };
    const media = window.matchMedia('(min-width: 640px)');
    const resize = () => {
      setDesktopOpen(false);
      setMobileOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    media.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      media.removeEventListener('change', resize);
    };
  }, []);

  const focusInput = () =>
    (mobileOpen ? mobileInput : desktopInput).current?.focus();

  const updateTerm = (value: string) => {
    setTerm(value);
    setSelected(null);
  };

  const searchField = (mobile: boolean) => (
    <form
      role="search"
      aria-label="Example community search"
      onSubmit={(event) => {
        event.preventDefault();
        if (!mobile) setDesktopOpen(true);
      }}
      className="ring-pana-flame/25 focus-within:ring-pana-indigo/55 flex h-11 min-w-0 items-center gap-2.5 rounded-full bg-white/85 pl-4 ring-1 transition-colors focus-within:bg-white focus-within:ring-2 motion-reduce:transition-none"
    >
      <Search
        className="text-pana-indigo/70 h-4 w-4 flex-none"
        aria-hidden="true"
      />
      <input
        ref={mobile ? mobileInput : desktopInput}
        type="search"
        aria-label={active.placeholder}
        aria-controls={!mobile && desktopOpen ? panelId : undefined}
        autoComplete="off"
        placeholder={active.placeholder}
        value={term}
        onFocus={() => {
          if (!mobile) setDesktopOpen(true);
        }}
        onClick={() => {
          if (!mobile) setDesktopOpen(true);
        }}
        onChange={(event) => updateTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          const container = mobile
            ? event.currentTarget.closest('[role="dialog"]')
            : desktopRoot.current;
          const firstResult = container?.querySelector<HTMLButtonElement>(
            '[data-search-result]'
          );
          if (firstResult) {
            event.preventDefault();
            firstResult.focus();
          }
        }}
        className="text-pana-ink placeholder:text-pana-ink/55 h-full min-w-0 flex-1 appearance-none border-0 bg-transparent pr-3 text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {term && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            updateTerm('');
            focusInput();
          }}
          className="text-pana-ink/60 focus-visible:ring-pana-indigo grid h-11 w-11 flex-none place-items-center rounded-full hover:bg-white focus-visible:ring-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="submit"
        className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 focus-visible:ring-pana-indigo h-11 flex-none rounded-full px-4 text-xs font-extrabold focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        Search
      </button>
    </form>
  );

  const searchPanel = (
    <>
      <div className="grid grid-cols-4 gap-1.5" aria-label="Search categories">
        {SCOPES.map((entry) => {
          const Icon = entry.icon;
          const isActive = scope === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              data-tone={entry.tone}
              aria-pressed={isActive}
              onClick={() => {
                setScope(entry.id);
                setSelected(null);
                focusInput();
              }}
              className={`flex min-h-19 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 py-2 text-[11px] font-extrabold transition-colors focus-visible:ring-2 focus-visible:ring-(--surface-tone-ink) motion-reduce:transition-none sm:text-xs ${isActive ? 'bg-(--surface-tone) text-(--surface-tone-on)' : 'text-pana-ink/65 hover:bg-(--surface-tone-soft)'}`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full ${isActive ? 'bg-white/15' : 'bg-(--surface-tone-soft) text-(--surface-tone-ink)'}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              {entry.label}
            </button>
          );
        })}
      </div>
      <div className="border-pana-flame/12 mt-3 border-t pt-4">
        <p className="text-pana-ink/60 mb-2 px-2 text-[11px] font-bold tracking-wide">
          {term.trim() ? `Results in ${active.label}` : active.heading}
        </p>
        <ul
          aria-label={`Example ${active.label} results`}
          className="space-y-1"
        >
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                data-search-result
                aria-label={`Preview ${result.name}`}
                aria-pressed={selected?.id === result.id}
                onClick={() => setSelected(result)}
                className={`focus-visible:ring-pana-indigo group flex min-h-17 w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left focus-visible:ring-2 ${selected?.id === result.id ? 'bg-pana-indigo/7' : 'hover:bg-pana-cream'}`}
              >
                <Image
                  src={result.image}
                  alt=""
                  width={40}
                  height={40}
                  className={`h-10 w-10 flex-none object-cover ${scope === 'panas' || scope === 'directory' ? 'rounded-full' : 'rounded-xl'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-pana-ink block truncate text-[13px] font-extrabold">
                    {result.name}
                  </span>
                  <span className="text-pana-ink/60 mt-1 block truncate text-xs">
                    {result.description}
                  </span>
                </span>
                {selected?.id === result.id ? (
                  <Check
                    className="text-pana-indigo h-4 w-4 flex-none"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowRight
                    className="text-pana-indigo/45 group-hover:text-pana-indigo h-4 w-4 flex-none"
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
        {!results.length && (
          <div role="status" className="px-2 py-7">
            <p className="text-sm font-extrabold">No sample matches yet.</p>
            <p className="text-pana-ink/65 mt-1 text-xs leading-relaxed">
              Try another name or category. These are example results only.
            </p>
          </div>
        )}
      </div>
      <p
        role="status"
        className="border-pana-flame/12 text-pana-ink/55 mt-3 border-t px-2 pt-3 text-[11px] leading-relaxed"
      >
        {selected
          ? `Preview selected: ${selected.name}. No real page was opened.`
          : 'Sample results only. Your feed stays right here.'}
      </p>
    </>
  );

  return (
    <>
      <div
        ref={desktopRoot}
        className="relative mx-auto hidden max-w-md min-w-0 flex-1 sm:block"
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setDesktopOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            desktopInput.current?.focus();
            setDesktopOpen(false);
          }
        }}
      >
        {searchField(false)}
        {desktopOpen && (
          <section
            id={panelId}
            aria-label="Community search suggestions"
            className="border-pana-flame/20 shadow-pana-ink/10 absolute top-[calc(100%+0.75rem)] left-0 w-full min-w-[22rem] rounded-3xl border bg-[#fffdf9] p-3 shadow-xl"
          >
            <p className="text-pana-indigo mb-3 flex items-center gap-1.5 px-2 pt-1 text-[11px] font-extrabold">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />A little
              closer to your community
            </p>
            {searchPanel}
          </section>
        )}
      </div>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label="Open community search"
            className="border-pana-flame/25 text-pana-indigo focus-visible:ring-pana-indigo ml-auto grid h-11 w-11 flex-none place-items-center rounded-full border bg-white/75 focus-visible:ring-2 sm:hidden"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-pana-ink/25 fixed inset-0 z-50 backdrop-blur-[2px]" />
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              mobileInput.current?.focus();
            }}
            className="border-pana-flame/20 fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto rounded-b-3xl border-b bg-[#fffdf9] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-5 shadow-xl"
          >
            <Dialog.Title className="pr-12 text-lg font-extrabold">
              Find your people.
            </Dialog.Title>
            <Dialog.Description className="text-pana-ink/65 mt-1 pr-10 text-xs leading-relaxed">
              Panas, places and good things to do.
            </Dialog.Description>
            <Dialog.Close
              aria-label="Close community search"
              className="text-pana-ink/65 focus-visible:ring-pana-indigo absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 grid h-11 w-11 place-items-center rounded-full hover:bg-white focus-visible:ring-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
            <div className="mt-5 mb-3">{searchField(true)}</div>
            {searchPanel}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
