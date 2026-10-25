'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Check,
  Flower2,
  Plus,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { MyCommitments } from '@/components/connectors/my-commitments';
import {
  ActionLibrary,
  TierLadder,
} from '@/components/connectors/action-library';
import {
  ConnectorHousePills,
  EventCard,
  HousePill,
} from '@/components/connectors/dashboard-parts';
import {
  OpportunityFacts,
  OpportunityState,
  WORK_BUTTON,
  WORK_CARD,
  WORK_DIALOG,
  WorkError,
  WorkFilters,
  useWorkDialogFocus,
} from '@/components/connectors/workflow-parts';
import { getPod, HOUSES } from '@/lib/connectors/model';
import type { HouseId, PodId, TierId } from '@/lib/connectors/model';
import type { ConnectorCommitment } from '@/lib/connectors/commitments';
import type { ConnectorEvent } from '@/lib/connectors/events-model';
import type { ConnectorOpportunity } from '@/lib/connectors/opportunities-model';
import {
  matchesOpportunity,
  opportunityStatus,
} from '@/lib/connectors/opportunities-model';
import { describeLoad } from '@/lib/connectors/hours';
import { saveConnectorWork } from '@/lib/connectors/client';
import { cn } from '@/lib/utils';

type HqTab = 'active' | 'opportunities' | 'completed';

export function HqDashboard({
  commitments,
  opportunities,
  houses,
  majorHouse,
  minorHouse,
  pod,
  tier,
  bring,
  upcoming,
}: {
  commitments: readonly ConnectorCommitment[];
  opportunities: readonly ConnectorOpportunity[];
  houses: readonly HouseId[];
  majorHouse: HouseId | null;
  minorHouse: HouseId | null;
  pod: PodId;
  tier: TierId;
  bring: string;
  upcoming: readonly ConnectorEvent[];
}) {
  const router = useRouter();
  const dialogFocus = useWorkDialogFocus();
  const [tab, setTab] = useState<HqTab>('active');
  const [filters, setFilters] = useState({
    house: 'all',
    pod: 'mine',
    query: '',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const busy = saving || pending;
  const joined = new Set(
    commitments.flatMap((row) => (row.opportunityId ? [row.opportunityId] : []))
  );
  const active = commitments.filter((row) => row.progress !== 'done');
  const completed = commitments.length - active.length;
  const openForPod = opportunities.filter(
    (item) =>
      opportunityStatus(item) === 'open' &&
      !joined.has(item.id) &&
      (item.pod === null || item.pod === pod)
  );
  const visible = opportunities.filter(
    (item) =>
      (['open', 'full'].includes(opportunityStatus(item)) ||
        joined.has(item.id)) &&
      matchesOpportunity(item, filters, pod)
  );
  const selected = opportunities.find((item) => item.id === selectedId);
  const load = {
    open: active.length,
    estimatedMinutes: active.reduce(
      (sum, row) => sum + (row.estimatedMinutes ?? 0),
      0
    ),
    unestimated: active.filter((row) => row.estimatedMinutes === null).length,
  };

  async function claim(id: string) {
    setSaving(true);
    setError(null);
    const failure = await saveConnectorWork(
      '/api/connectors/opportunities',
      'POST',
      { id }
    );
    setSaving(false);
    if (failure) setError(failure);
    else {
      setMessage(
        "You're in. Added to your commitments, with the coordinator crew updated too."
      );
      setSelectedId(null);
    }
    startTransition(() => router.refresh());
  }

  function go(next: HqTab) {
    setTab(next);
    setSelectedId(null);
    setError(null);
    setMessage('');
  }

  function claimButton(opportunity: ConnectorOpportunity) {
    if (joined.has(opportunity.id))
      return (
        <button
          type="button"
          className="text-pana-indigo inline-flex min-h-11 items-center gap-1.5 text-xs font-extrabold"
          onClick={() =>
            go(
              commitments.some(
                (row) =>
                  row.opportunityId === opportunity.id &&
                  row.progress === 'done'
              )
                ? 'completed'
                : 'active'
            )
          }
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          On your board
        </button>
      );
    const status = opportunityStatus(opportunity);
    return (
      <button
        type="button"
        disabled={busy || status !== 'open'}
        className={WORK_BUTTON}
        onClick={() => claim(opportunity.id)}
      >
        {saving
          ? 'Saving...'
          : status === 'open'
            ? "I'll do this"
            : status === 'full'
              ? 'All set'
              : 'Not available'}
        {status === 'open' && <Plus className="h-4 w-4" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className="container mx-auto min-w-0 px-4">
      <nav
        aria-label="Your connector work"
        data-work-navigation
        className="border-pana-ink/15 mb-6 flex min-w-0 gap-1 border-b sm:gap-5"
      >
        {(
          [
            { id: 'active', label: 'My commitments', count: active.length },
            {
              id: 'opportunities',
              label: 'Find a way to help',
              count: openForPod.length,
            },
            { id: 'completed', label: 'Completed', count: completed },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => go(item.id)}
            className={`inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1 border-b-[3px] px-0.5 py-3 text-[0.65rem] font-extrabold sm:flex-initial sm:gap-1.5 sm:text-sm ${tab === item.id ? 'border-pana-indigo text-pana-ink' : 'text-pana-ink/60 border-transparent'}`}
          >
            <span className="min-w-0">{item.label}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] ${tab === item.id ? 'bg-pana-indigo text-pana-cream' : 'bg-pana-ink/5'}`}
            >
              {item.count}
            </span>
          </button>
        ))}
      </nav>
      <div
        role="status"
        className="mb-4 flex flex-wrap items-center gap-3 empty:hidden"
      >
        {message && (
          <>
            <p className="text-pana-indigo text-sm font-bold">{message}</p>
            {tab !== 'active' && (
              <button
                type="button"
                onClick={() => go('active')}
                className="text-pana-indigo min-h-10 text-xs font-bold underline underline-offset-4"
              >
                View my board
              </button>
            )}
          </>
        )}
      </div>
      {!selected && (
        <div className="mb-4 empty:hidden">
          <WorkError message={error} />
        </div>
      )}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          className="min-w-0"
          aria-label={
            tab === 'opportunities'
              ? 'Open opportunities'
              : tab === 'completed'
                ? 'Completed commitments'
                : 'Active commitments'
          }
        >
          {tab !== 'opportunities' ? (
            <MyCommitments
              commitments={commitments}
              opportunities={opportunities}
              houses={houses}
              completed={tab === 'completed'}
              onBrowse={() => go('opportunities')}
            />
          ) : (
            <>
              <h2 className="text-xl font-extrabold tracking-tight">
                Find your next small thing.
              </h2>
              <p className="text-pana-ink/65 mt-1 mb-5 text-xs leading-relaxed">
                Real asks from the programme. Choose one and you&apos;re in. No
                approval queue.
              </p>
              <WorkFilters value={filters} onChange={setFilters} myPod />
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {visible.length === 0 ? (
                  <div
                    className={`${WORK_CARD} border-dashed py-10 text-center sm:col-span-2`}
                  >
                    <h3 className="text-lg font-extrabold">
                      No open asks match just yet.
                    </h3>
                    <p className="text-pana-ink/65 mt-2 text-sm">
                      Try another house or pod, or start with a little
                      inspiration below.
                    </p>
                  </div>
                ) : (
                  visible.map((opportunity) => (
                    <article
                      key={opportunity.id}
                      className={cn(
                        WORK_CARD,
                        'flex flex-col',
                        joined.has(opportunity.id) && 'border-pana-indigo'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <HousePill houseId={opportunity.house} />
                        <span className="text-pana-ink/60 text-[0.6rem] font-extrabold tracking-wide uppercase">
                          {opportunity.eventId || opportunity.connectorEventId
                            ? 'Event help'
                            : 'Task / project'}
                        </span>
                      </div>
                      <h3 className="mt-4 text-lg leading-snug font-extrabold tracking-tight">
                        {opportunity.title}
                      </h3>
                      <p className="text-pana-ink/65 mt-2 mb-5 text-xs leading-relaxed whitespace-pre-wrap">
                        {opportunity.details}
                      </p>
                      <div className="mt-auto">
                        <OpportunityFacts opportunity={opportunity} />
                      </div>
                      <div className="border-pana-ink/15 mt-5 border-t pt-3">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Users className="h-4 w-4" aria-hidden="true" />
                          <OpportunityState opportunity={opportunity} />
                          {opportunity.spots !== null && (
                            <span className="text-pana-ink/60 text-xs">
                              {opportunity.signups} of {opportunity.spots}{' '}
                              filled
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            aria-label={`Details for ${opportunity.title}`}
                            className="text-pana-ink/65 min-h-11 text-xs font-bold underline underline-offset-4"
                            onClick={(event) => {
                              dialogFocus.remember(event);
                              setSelectedId(opportunity.id);
                              setError(null);
                            }}
                          >
                            The details
                          </button>
                          {claimButton(opportunity)}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <details className="border-pana-ink/25 mt-6 border-t border-dashed pt-4">
                <summary className="cursor-pointer py-2 text-sm font-extrabold">
                  Not seeing your thing? Start with a little inspiration.
                </summary>
                <p className="text-pana-ink/65 mt-2 mb-4 text-xs leading-relaxed">
                  These are general house ideas, not open staff requests or
                  reserved spots. Adding one makes a self-directed commitment.
                </p>
                <ActionLibrary
                  houses={houses}
                  tier={tier}
                  committed={commitments.map((row) => row.what)}
                  onCommitted={() => {
                    go('active');
                    setMessage(
                      'Your self-directed commitment is on the board and visible to coordinators.'
                    );
                  }}
                />
              </details>
            </>
          )}
        </section>
        <aside
          className="flex min-w-0 flex-col gap-5"
          aria-label="Your pod and next steps"
        >
          {tab !== 'opportunities' ? (
            <section className="bg-pana-butter border-pana-ink/10 rounded-2xl border p-6">
              <Flower2 className="mb-5 h-9 w-9" aria-hidden="true" />
              <p className="text-pana-indigo text-[0.6rem] font-extrabold tracking-[0.15em] uppercase">
                A hand makes a difference
              </p>
              <h2 className="mt-3 text-2xl leading-tight font-extrabold tracking-tight">
                A little time.
                <br />A real local impact.
              </h2>
              <p className="mt-3 mb-5 text-xs leading-relaxed">
                {openForPod.length} open ways to help in your pod or across the
                programme. Pick what feels like you.
              </p>
              <button
                type="button"
                className={`${WORK_BUTTON} w-full`}
                onClick={() => go('opportunities')}
              >
                Find a way to help
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </section>
          ) : (
            <section className={WORK_CARD}>
              <p className="text-pana-indigo text-[0.6rem] font-extrabold tracking-[0.13em] uppercase">
                Before you pick something up
              </p>
              <p className="mt-4 text-4xl font-extrabold">{active.length}</p>
              <h2 className="mt-1 text-sm font-extrabold">
                already on your board
              </h2>
              <p className="text-pana-ink/65 mt-3 text-xs">
                {describeLoad(load)}
              </p>
              <p className="border-pana-ink/15 text-pana-ink/65 mt-4 border-t pt-4 text-xs leading-relaxed">
                Outstanding work, not a weekly capacity or a limit.
              </p>
              <button
                type="button"
                className="text-pana-indigo mt-3 min-h-11 text-xs font-bold underline underline-offset-4"
                onClick={() => go('active')}
              >
                See my commitments
              </button>
            </section>
          )}
          <section className={WORK_CARD}>
            <p className="text-pana-indigo text-[0.6rem] font-extrabold tracking-[0.13em] uppercase">
              Your corner of the programme
            </p>
            <h2 className="mt-3 text-base font-extrabold">
              {getPod(pod).name} pod
            </h2>
            <p className="text-pana-ink/65 mt-2 text-xs leading-relaxed">
              Your houses describe your focus, not a limit on where you can
              help.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ConnectorHousePills
                houses={houses}
                majorHouse={majorHouse}
                minorHouse={minorHouse}
              />
            </div>
            <button
              type="button"
              className="text-pana-indigo mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-bold underline underline-offset-4"
              onClick={(event) => {
                dialogFocus.remember(event);
                setGuideOpen(true);
              }}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Programme guide
            </button>
          </section>
          <section className={WORK_CARD}>
            <h2 className="text-base font-extrabold">Coming up</h2>
            {upcoming.length ? (
              <div className="mt-4 flex flex-col gap-3">
                {upcoming.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p className="text-pana-ink/65 mt-3 text-xs leading-relaxed">
                Nothing on the calendar for {getPod(pod).name} yet. Organizers
                post gatherings here.
              </p>
            )}
          </section>
          <p className="text-pana-ink/65 px-2 text-xs leading-relaxed">
            <strong className="text-pana-ink mb-1 block">
              You don&apos;t have to carry everything.
            </strong>
            Tiers describe how much you&apos;re carrying, not how good you are
            at it. Small is a good place to start.
          </p>
        </aside>
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) setSelectedId(null);
        }}
      >
        <DialogContent
          className={WORK_DIALOG}
          onCloseAutoFocus={dialogFocus.restore}
        >
          {selected && (
            <>
              <HousePill houseId={selected.house} />
              <DialogTitle className="text-2xl leading-snug font-extrabold">
                {selected.title}
              </DialogTitle>
              <DialogDescription className="text-pana-ink/65 leading-relaxed whitespace-pre-wrap">
                {selected.details}
              </DialogDescription>
              <OpportunityFacts opportunity={selected} />
              <OpportunityState opportunity={selected} />
              <p className="text-pana-ink/65 text-xs leading-relaxed">
                Choosing this adds it straight to your commitments and updates
                the coordinator view. No approval needed.
              </p>
              <WorkError message={error} />
              <div className="flex justify-end">{claimButton(selected)}</div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent
          className={WORK_DIALOG}
          onCloseAutoFocus={dialogFocus.restore}
        >
          <DialogTitle className="text-2xl font-extrabold">
            Find your people. Do your small thing.
          </DialogTitle>
          <DialogDescription className="text-pana-ink/65">
            Pods are geographic. Houses describe the kind of work. You can help
            outside your own house or pod.
          </DialogDescription>
          {HOUSES.map((house) => (
            <div key={house.id} className="border-pana-ink/15 border-t pt-4">
              <HousePill houseId={house.id} />
              <p className="text-pana-ink/65 mt-2 text-xs leading-relaxed">
                {house.blurb}
              </p>
            </div>
          ))}
          <TierLadder tier={tier} />
          {bring && (
            <div className="border-pana-ink/15 border-t pt-4">
              <h3 className="text-sm font-extrabold">
                What you said you can bring
              </h3>
              <p className="text-pana-ink/65 mt-2 text-xs leading-relaxed whitespace-pre-wrap">
                {bring}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
