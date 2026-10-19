'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Pillar, PillarProgram } from './content';
import { RailNav, useIsRail, useRail } from './rail';

interface PillarPanelsProps {
  pillars: Pillar[];
}

/* Matches the CSS breakpoint below, where `.pillars` stops being a flex row
   of spines and becomes a scroll rail. */
const PILLAR_RAIL_QUERY = '(max-width: 63.99rem)';

/**
 * The three pillars, as expanding panels.
 *
 * The deck puts Collective Tech, Community Building and Culture Work on one
 * slide as three equal columns, and that is the claim: they are three halves
 * of the same thing, not a ranked list. Three equal columns of body copy on a
 * homepage is also how you get three columns nobody reads — so the panels keep
 * all three present at once and give the open one the room its programme list
 * needs.
 *
 * Above 64rem the closed panels collapse to a spine and the open one takes the
 * remaining width, which is the shape in the sketch.
 *
 * Below that it is a horizontal rail of three whole cards, matching the
 * questions above it. It was a vertical accordion, which cost the section its
 * one-screen promise: an open panel plus two closed bars plus the heading ran
 * 1,117px against an 844px phone, so the section could not be taken in at a
 * glance no matter how much padding came out of it. As a rail only one pillar
 * is on screen, so each one gets the full height instead of a third of it,
 * and nothing has to be cut to make the three fit together.
 *
 * On a rail there is no disclosure left — every card is already open — so the
 * trigger stops being a button rather than sitting there claiming an
 * `aria-expanded` it no longer controls.
 *
 * One panel is always open, so the section never collapses into three closed
 * bars with nothing to read. That means clicking the open panel is a no-op
 * rather than a close — the honest alternative, letting it close, leaves a
 * state where the section says nothing at all.
 */
export function PillarPanels({ pillars }: PillarPanelsProps) {
  const [active, setActive] = useState(pillars[0].id);
  const isRail = useIsRail(PILLAR_RAIL_QUERY);
  const { railRef, rail, syncRail, nudge } = useRail<HTMLDivElement>('.pillar');

  return (
    <div className="pillars-rail">
      <div className="pillars" ref={railRef} onScroll={syncRail}>
        {pillars.map((pillar, index) => {
          const isOpen = isRail || pillar.id === active;
          const triggerId = `pillar-trigger-${pillar.id}`;
          const bodyId = `pillar-body-${pillar.id}`;
          const label = (
            <>
              <span className="pillar-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="pillar-name">{pillar.name}</span>
              {!isRail && (
                <ArrowRight className="pillar-chev" aria-hidden="true" />
              )}
            </>
          );

          return (
            <section
              key={pillar.id}
              id={`pillar-${pillar.id}`}
              className="pillar"
              data-accent={pillar.accent}
              data-open={isOpen}
              aria-labelledby={triggerId}
            >
              <h3 className="pillar-head">
                {isRail ? (
                  <span id={triggerId} className="pillar-trigger">
                    {label}
                  </span>
                ) : (
                  <button
                    type="button"
                    id={triggerId}
                    className="pillar-trigger"
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    onClick={() => setActive(pillar.id)}
                  >
                    {label}
                  </button>
                )}
              </h3>

              <div id={bodyId} className="pillar-body" hidden={!isOpen}>
                <p className="pillar-problem">{pillar.problem}</p>
                <p className="pillar-answer">{pillar.answer}</p>

                <ul className="pillar-programs">
                  {pillar.programs.map((program) => (
                    <li key={program.name}>
                      <ProgramRow program={program} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      {isRail && (
        <RailNav
          rail={rail}
          nudge={nudge}
          className="pillars-nav"
          prevLabel="Previous pillar"
          nextLabel="Next pillar"
        />
      )}
    </div>
  );
}

/* A programme with somewhere to go is a link; one without is not. Rendering
   the unshipped ones as links to `#` would teach visitors that half this
   section's rows are broken. */
function ProgramRow({ program }: { program: PillarProgram }) {
  const isExternal = program.href?.startsWith('http') ?? false;

  const inner = (
    <>
      <span className="pillar-program-name">
        {program.name}
        {program.href && (
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </span>
      <span className="pillar-program-note">{program.note}</span>
      <span className="pillar-program-status" data-status={program.status}>
        {program.statusLabel}
      </span>
    </>
  );

  if (!program.href) {
    return <div className="pillar-program">{inner}</div>;
  }

  return (
    <Link
      href={program.href}
      className="pillar-program"
      {...(isExternal
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : null)}
    >
      {inner}
      {isExternal && <span className="sr-only">(opens in a new tab)</span>}
    </Link>
  );
}
