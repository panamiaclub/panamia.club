'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { HOUSES, TIERS } from '@/lib/connectors/model';
import type { House, HouseId, TierId } from '@/lib/connectors/model';
import { CONNECTORS_CHROME } from '@/lib/connectors/theme';
import { saveConnectorWork } from '@/lib/connectors/client';

/**
 * The action library — "what should I actually do?", answered.
 *
 * ## The gap this closes
 *
 * The programme deck devotes four slides to this question: each house gets a
 * list of real actions at each of the three tiers, thirty-six in total. In
 * the app those lists were rendered as a read-only ladder in the sidebar, and
 * the only way to act on one was to read it, remember it, and retype it into
 * a free-text box further up the page.
 *
 * So the hardest question in the programme — a new Tier 1 connector asking
 * what they are supposed to do on Monday — was answered by an empty input.
 * Every action here is one click away from being a commitment now.
 *
 * The deck also keeps a growing list of actions in a public spreadsheet that
 * connectors are invited to add to. This is not that list; this is the
 * canonical set from the deck, which is the part that already lives in the
 * codebase as data. The spreadsheet is the obvious next thing to absorb, and
 * when it is, it lands in `lib/connectors/model.ts` beside these.
 *
 * ## Why all three tiers are shown, not just yours
 *
 * The deck is emphatic that tiers are not a ranking and not a measure of how
 * far along anybody is — everyone starts at Tier 1 regardless of how much
 * organising they have done. They describe how much weight you are carrying.
 *
 * Showing only your own tier would quietly turn that into a gate. Showing all
 * three, with yours marked and every action committable, keeps it a
 * description of the work rather than a permission level: if a Tier 1
 * connector wants to run a workshop, nothing here stops them.
 *
 * ## Why other houses are behind a toggle
 *
 * Your own houses are the answer nine times out of ten, and thirty-six
 * actions at once is a wall rather than a prompt. But the programme does not
 * fence houses off — the commitment form has always let you file work under a
 * house you are not in — so the rest stay one click away rather than absent.
 */

/** Actions already on the board, matched loosely so a re-add is caught. */
function normalise(what: string): string {
  return what.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function ActionLibrary({
  houses,
  tier,
  committed,
  onCommitted,
}: {
  /** The member's own houses. Empty is tolerated — everything becomes "other". */
  houses: readonly HouseId[];
  tier: TierId;
  /** The `what` of every commitment already on the board. */
  committed: readonly string[];
  onCommitted?: (action: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const taken = useMemo(() => new Set(committed.map(normalise)), [committed]);

  const mine = HOUSES.filter((h) => houses.includes(h.id));
  const others = HOUSES.filter((h) => !houses.includes(h.id));

  async function commit(action: string, house: HouseId) {
    setError(null);
    setBusy(action);
    const failure = await saveConnectorWork(
      '/api/connectors/commitments',
      'POST',
      { what: action, house }
    );
    setBusy(null);
    if (failure) {
      setError(failure);
      return;
    }
    router.refresh();
    onCommitted?.(action);
  }

  return (
    <>
      <p className="text-pana-ink/70 text-sm leading-relaxed">
        Straight from the programme. Tiers describe how much you are carrying,
        not how good you are at it — pick from any of them.
      </p>

      {error && (
        <p
          role="alert"
          className="border-pana-ink bg-pana-butter text-pana-ink mt-4 rounded-lg border-2 px-3 py-2 text-sm font-bold"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-7">
        {(mine.length > 0 ? mine : others).map((house) => (
          <HouseActions
            key={house.id}
            house={house}
            tier={tier}
            taken={taken}
            busy={busy}
            onCommit={commit}
          />
        ))}
      </div>

      {mine.length > 0 && others.length > 0 && (
        <div className="border-pana-ink/25 mt-7 border-t-2 border-dashed pt-5">
          {showOthers ? (
            <div className="flex flex-col gap-7">
              <p className="text-pana-ink/70 text-sm leading-relaxed">
                Work from the other houses. Nothing stops you picking one up —
                it files under that house rather than yours.
              </p>
              {others.map((house) => (
                <HouseActions
                  key={house.id}
                  house={house}
                  tier={tier}
                  taken={taken}
                  busy={busy}
                  onCommit={commit}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowOthers(true)}
              className="text-pana-indigo text-sm font-bold underline underline-offset-4"
            >
              Show what the other houses are doing
            </button>
          )}
        </div>
      )}
    </>
  );
}

function HouseActions({
  house,
  tier,
  taken,
  busy,
  onCommit,
}: {
  house: House;
  tier: TierId;
  taken: ReadonlySet<string>;
  busy: string | null;
  onCommit: (action: string, house: HouseId) => void;
}) {
  return (
    <section>
      <h3>
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-extrabold"
          style={{
            backgroundColor: `var(--color-${house.color})`,
            color: `var(--color-${house.onColor})`,
          }}
        >
          {house.name}
        </span>
      </h3>

      <div className="mt-3 flex flex-col gap-4">
        {([1, 2, 3] as const).map((t) => (
          <div key={t}>
            <p className="text-pana-ink/60 text-xs font-extrabold tracking-wide uppercase">
              Tier {t}
              {t === tier ? ' · you' : ''}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {house.actions[t].map((action) => (
                <ActionRow
                  key={action}
                  action={action}
                  done={taken.has(normalise(action))}
                  busy={busy === action}
                  disabled={busy !== null}
                  onCommit={() => onCommit(action, house.id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * One action, and the button that turns it into a commitment.
 *
 * An action already on the board keeps its place in the list rather than
 * disappearing — the list is the programme's description of the work, not a
 * queue, and silently removing items would make it look like the programme
 * had shrunk.
 */
function ActionRow({
  action,
  done,
  busy,
  disabled,
  onCommit,
}: {
  action: string;
  done: boolean;
  busy: boolean;
  disabled: boolean;
  onCommit: () => void;
}) {
  return (
    <li className="border-pana-ink/15 flex items-start justify-between gap-3 border-b-2 pb-2 last:border-b-0 last:pb-0">
      <span
        className={`text-sm leading-snug ${done ? 'text-pana-ink/50' : ''}`}
      >
        {action}
      </span>

      {done ? (
        <span className="text-pana-ink/50 shrink-0 text-xs font-bold whitespace-nowrap">
          On your board
        </span>
      ) : (
        <button
          type="button"
          onClick={onCommit}
          disabled={disabled}
          className={`shrink-0 rounded-full border-2 ${CONNECTORS_CHROME.BORDER} ${CONNECTORS_CHROME.FILL} px-3 py-1 text-xs font-extrabold ${CONNECTORS_CHROME.ON_FILL} disabled:opacity-50`}
        >
          {busy ? 'Adding…' : "I'll do this"}
        </button>
      )}
    </li>
  );
}

/**
 * The tier ladder as plain explanation, for the sidebar.
 *
 * Separate from the library because it answers a different question. The
 * library asks what to do; this answers "what does Tier 2 even mean", which
 * is the thing people get wrong about this programme — the deck spends a
 * paragraph insisting tiers are not seniority and that everyone starts at
 * Tier 1, and that correction only landed on a slide during onboarding.
 *
 * Names and blurbs come from `TIERS` rather than being restated here, so the
 * programme's own wording stays the only copy of itself.
 */
export function TierLadder({ tier }: { tier: TierId }) {
  return (
    <>
      <p className="text-pana-ink/70 text-sm leading-relaxed">
        Tiers are about how much you are carrying — not how good you are at it,
        and not how long you have been doing this. Everyone starts at Tier 1.
      </p>
      <ol className="mt-4 flex flex-col gap-3">
        {TIERS.map((t) => {
          const here = t.id === tier;
          return (
            <li
              key={t.id}
              className={
                here
                  ? 'border-pana-ink rounded-lg border-2 p-3'
                  : 'px-3 opacity-60'
              }
            >
              <p className="text-xs font-extrabold tracking-wide uppercase">
                Tier {t.id}
                {here ? ' · you' : ''}
              </p>
              <p className="mt-0.5 text-sm font-bold">{t.name}</p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
