import Link from 'next/link';

/**
 * The parts of /admin/livesite that only draw.
 *
 * Split from the page for the same reason `components/Admin/parts.tsx` exists:
 * the page is a server component that reads the database, and everything here
 * is a pure function of its props. Keeping them apart means the layout can be
 * rendered and checked without a connection string, which matters for a page
 * whose interesting state — queues backed up — is the state you cannot
 * conveniently produce on demand.
 *
 * Server components. Nothing here needs a client bundle.
 */

export interface WaitingItem {
  /** Singular noun. Pluralised by `plural`, not by appending an s. */
  label: string;
  plural: string;
  count: number;
  /** Where to clear it, or null when no tool owns this queue yet. */
  href: string | null;
  /** Completes the sentence after the noun: "3 abuse reports needing triage". */
  verb: string;
}

/**
 * The only part of the page that changes shape.
 *
 * Flame and a list when there is something to do; one quiet line when there
 * is not. The empty state is deliberately small — it is the state this page
 * should be in almost always, and a full-width all-clear panel would take up
 * the room the alarm needs to be startling in.
 *
 * Rows arrive in a fixed order rather than sorted by count or severity. A
 * strip that reorders itself between visits has to be re-read each time,
 * which costs more than the ranking saves.
 */
export function AttentionStrip({
  waiting,
}: {
  waiting: readonly WaitingItem[];
}) {
  if (!waiting.length) {
    return (
      <p className="rounded-xl border-2 border-dashed border-pana-ink/30 px-5 py-3 text-sm font-bold text-pana-ink/60">
        Nothing waiting. Every queue is clear.
      </p>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border-2 border-pana-ink bg-pana-flame">
      <header className="px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-pana-ink">
          Needs attention
        </h2>
      </header>
      <ul className="divide-y-2 divide-pana-ink/20 border-t-2 border-pana-ink/20">
        {waiting.map((q) => {
          const text = `${q.count} ${q.count === 1 ? q.label : q.plural} ${q.verb}`;
          return (
            <li key={q.label} className="px-5 py-3">
              {q.href ? (
                <Link
                  href={q.href}
                  className="text-sm font-bold text-pana-ink underline underline-offset-2 hover:no-underline"
                >
                  {text}
                </Link>
              ) : (
                /* No screen owns this queue yet, so the row states the number
                   without pretending there is somewhere to go. Styling it as
                   a link would be the worse lie of the two.

                   Distinguished by weight rather than by fading the ink. The
                   obvious `text-pana-ink/70` composites to 4.49 against this
                   flame fill, which misses AA by a hundredth — and it is the
                   same trap as the load-table band chip, where the fix was
                   also to change shape instead of colour. Full ink at normal
                   weight reads as secondary and measures 7.50. */
                <span className="text-sm font-bold text-pana-ink">
                  {text}
                  <span className="font-normal text-pana-ink">
                    {' '}
                    — no tool for this yet
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A band that is planned but cannot report yet, drawn so the gap is visible.
 *
 * Dashed and unfilled is the established "you cannot click this" shape on
 * this surface — same as the unbuilt tools on the overview. Stating what it
 * would take to fill in is the point: an empty panel reads as a bug, a
 * missing panel reads as nothing at all.
 */
export function Placeholder({
  title,
  lead,
  needs,
}: {
  title: string;
  lead: string;
  needs: string;
}) {
  return (
    <section className="rounded-xl border-2 border-dashed border-pana-ink/30 p-5">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-pana-ink/60">
        {title}
      </h3>
      <p className="mt-2 text-sm font-bold text-pana-ink/70">{lead}</p>
      <p className="mt-2 text-xs text-pana-ink/60">{needs}</p>
    </section>
  );
}

/** One fact about the last run. `value` is already formatted. */
export interface RunFact {
  label: string;
  value: string;
}

/** A console this page cannot read from, with the reason and a way in. */
export interface ExternalConsole {
  name: string;
  /** What it would take to read this here, in one sentence. */
  blocked: string;
  href: string;
  linkLabel: string;
}

/**
 * The infrastructure band: can the platform underneath still take the load.
 *
 * ## Why this panel has two halves with different confidence
 *
 * The database half is measured. Postgres is asked directly, over the
 * connection the page already holds, and it answers about itself.
 *
 * The Cloudflare half is not measured, because reading it needs an API token
 * that does not exist yet. Rather than leave a blank, the panel says what is
 * missing and links to the console where the answer lives — which is what an
 * admin would do next anyway, and is honest in a way that an empty chart
 * would not be.
 *
 * The two degrade independently. A missing token never hides database health,
 * and a database that will not answer never hides the links out.
 */
export function InfrastructurePanel({
  tone,
  headline,
  detail,
  facts,
  consoles,
}: {
  tone: 'ok' | 'warn' | 'alarm';
  headline: string;
  detail: string;
  facts: readonly RunFact[];
  consoles: readonly ExternalConsole[];
}) {
  // Same contrast reasoning as MachineryPanel: full ink on both loud fills.
  const shell =
    tone === 'alarm'
      ? 'border-pana-ink bg-pana-flame'
      : tone === 'warn'
        ? 'border-pana-ink bg-pana-butter'
        : 'border-pana-ink/30 bg-white';

  const quiet = tone === 'ok';

  return (
    <section className={`overflow-hidden rounded-xl border-2 ${shell}`}>
      <div className="px-5 py-4">
        <h2
          className={`text-sm font-extrabold uppercase tracking-wide ${
            quiet ? 'text-pana-ink/60' : 'text-pana-ink'
          }`}
        >
          Infrastructure
        </h2>
        <p className="mt-2 text-base font-extrabold text-pana-ink">
          {headline}
        </p>
        <p
          className={`mt-1 max-w-2xl text-sm ${
            quiet ? 'text-pana-ink/70' : 'font-medium text-pana-ink'
          }`}
        >
          {detail}
        </p>
      </div>

      {facts.length > 0 && (
        <dl
          className={`flex flex-wrap gap-x-8 gap-y-3 border-t-2 px-5 py-3 ${
            quiet ? 'border-pana-ink/15' : 'border-pana-ink/20'
          }`}
        >
          {facts.map((f) => (
            <div key={f.label}>
              <dt
                className={`text-xs font-bold uppercase tracking-wide ${
                  quiet ? 'text-pana-ink/60' : 'text-pana-ink'
                }`}
              >
                {f.label}
              </dt>
              <dd className="mt-0.5 text-sm font-extrabold text-pana-ink">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {consoles.length > 0 && (
        // white/60 over flame lands light enough that /70 body copy clears AA
        // at 6.18, but the small uppercase label at /60 measured 4.49 on it --
        // the same 0.01 miss AttentionStrip documents. Distinguished by weight
        // rather than opacity on the loud fills, for the same reason.
        <div
          className={`border-t-2 bg-white/60 px-5 py-3 ${
            quiet ? 'border-pana-ink/15' : 'border-pana-ink/20'
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              quiet ? 'text-pana-ink/60' : 'text-pana-ink'
            }`}
          >
            Not readable from here
          </p>
          <ul className="mt-2 space-y-2">
            {consoles.map((c) => (
              <li key={c.name} className="text-sm">
                <span className="font-extrabold text-pana-ink">{c.name}</span>
                <span className="text-pana-ink/70"> — {c.blocked} </span>
                <a
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-pana-ink underline underline-offset-2 hover:opacity-70"
                >
                  {c.linkLabel}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * A scheduled-work band: did the thing that should have happened, happen.
 *
 * Shared by two bands with the same shape -- Machinery (did the hourly sweep
 * run) and Visitor experience (did the hourly probes find the site up) --
 * which is why the heading is a prop. They are two readings of the same
 * ledger, so giving them two components would mean maintaining one layout
 * twice and letting the two loud states drift apart visually.
 *
 * ## Why the fill carries the verdict
 *
 * Flame when something is wrong, butter when something is worth a look,
 * nothing at all when it is fine. This is the same grammar the attention
 * strip uses one section above — flame means a human is needed — so the two
 * loud states on this page read as one alarm rather than two vocabularies.
 *
 * The quiet state is not blank, though, and that is the difference from the
 * strip. "Nothing is waiting" is the whole of what an empty queue has to
 * say; "the sweep ran" invites the follow-up "and did it do anything?", so
 * the facts stay visible even when the verdict is fine. They are what makes
 * the page worth opening on a good day, which is what keeps it trusted on a
 * bad one.
 *
 * Colour is never the only carrier: every state leads with a sentence that
 * says what is happening. The fill is how you notice from across the room,
 * not how you find out.
 */
export function MachineryPanel({
  tone,
  headline,
  detail,
  facts,
  title = 'Machinery',
}: {
  tone: 'ok' | 'warn' | 'alarm';
  headline: string;
  detail: string;
  facts: readonly RunFact[];
  title?: string;
}) {
  // Ink on flame measures 7.50 and ink on butter is higher still, so body
  // copy stays at full ink on both fills rather than being faded to signal
  // hierarchy — the /70 that would normally do that is exactly what fails on
  // flame. See the note in AttentionStrip.
  const shell =
    tone === 'alarm'
      ? 'border-pana-ink bg-pana-flame'
      : tone === 'warn'
        ? 'border-pana-ink bg-pana-butter'
        : 'border-pana-ink/30 bg-white';

  const quiet = tone === 'ok';

  return (
    <section className={`overflow-hidden rounded-xl border-2 ${shell}`}>
      <div className="px-5 py-4">
        <h2
          className={`text-sm font-extrabold uppercase tracking-wide ${
            quiet ? 'text-pana-ink/60' : 'text-pana-ink'
          }`}
        >
          {title}
        </h2>
        <p className="mt-2 text-base font-extrabold text-pana-ink">
          {headline}
        </p>
        <p
          className={`mt-1 max-w-2xl text-sm ${
            quiet ? 'text-pana-ink/70' : 'font-medium text-pana-ink'
          }`}
        >
          {detail}
        </p>
      </div>

      {facts.length > 0 && (
        <dl
          className={`flex flex-wrap gap-x-8 gap-y-3 border-t-2 px-5 py-3 ${
            quiet ? 'border-pana-ink/15' : 'border-pana-ink/20'
          }`}
        >
          {facts.map((f) => (
            <div key={f.label}>
              <dt
                className={`text-xs font-bold uppercase tracking-wide ${
                  quiet ? 'text-pana-ink/60' : 'text-pana-ink'
                }`}
              >
                {f.label}
              </dt>
              <dd className="mt-0.5 text-sm font-extrabold text-pana-ink">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
