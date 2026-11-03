'use client';

import { FlaskConical, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

/** How much air the page's vertical rhythm gets.
 *
 *  `roomy` reproduces what the live site does today: a hero pinned to the
 *  full viewport and `py-16 md:py-24` on every band. `compact` is the
 *  proposal. Nothing else differs between them, so whatever you see move is
 *  the spacing and only the spacing. */
export type Density = 'compact' | 'roomy';

const DENSITIES: { value: Density; label: string; hint: string }[] = [
  { value: 'compact', label: 'Compact', hint: 'The proposal' },
  { value: 'roomy', label: 'Roomy', hint: "Today's live spacing" },
];

/**
 * Scaffolding, not design — same bar the other mocks carry.
 *
 * The density switch compares the shared homepage's two spacing options
 * without requiring database access.
 */
export function MockControls({
  density,
  onDensityChange,
}: {
  density: Density;
  onDensityChange: (next: Density) => void;
}) {
  return (
    <div className="bizprofile-mockbar">
      <div className="container mx-auto flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-extrabold tracking-wider uppercase opacity-70">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Design mock · Homepage
        </span>

        <Link href="/" className="mock-toolbar-link">
          Compare with the live homepage
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>

        {/* A radiogroup rather than a checkbox: these are two named options,
            not an on/off, and "compact" being the default should not make
            "roomy" read as the unchecked state of it. Reuses the same
            `.mock-switch` the other mocks' toolbars use. */}
        <div className="ml-auto flex items-center gap-2">
          <span
            className="text-xs font-extrabold tracking-wider uppercase opacity-55"
            aria-hidden="true"
          >
            Spacing
          </span>
          <div
            className="mock-switch"
            role="radiogroup"
            aria-label="Vertical spacing"
          >
            {DENSITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={density === option.value}
                title={option.hint}
                data-active={density === option.value}
                onClick={() => onDensityChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
