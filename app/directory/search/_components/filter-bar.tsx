'use client';

import { LayoutList, Map as MapIcon, X } from 'lucide-react';
import { profileCategoryList } from '@/lib/lists';
import type { DirectorySort } from '@/lib/query/directory';
import {
  DIRECTORY_RADIUS_OPTIONS,
  type DirectoryRadius,
} from '@/lib/directory-radius';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/filter-menu';

export type ResultView = 'list' | 'map';

/** The subset of search state this bar owns. */
export interface FilterState {
  categories: string[];
  radius: DirectoryRadius;
  certifiedOnly: boolean;
  withEventsOnly: boolean;
  sort: DirectorySort;
}

const SORT_OPTIONS: { key: DirectorySort; label: string }[] = [
  { key: 'relevance', label: 'Best match' },
  { key: 'nearest', label: 'Nearest' },
  { key: 'recommended', label: 'Most recommended' },
  { key: 'name', label: 'A–Z' },
];

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  view: ResultView;
  onViewChange: (next: ResultView) => void;
  /** Disables "Nearest" until there is a location to measure from. */
  locationShared: boolean;
}

/**
 * Refinement, on one line.
 *
 * This bar used to lay every choice out as chips across three labelled rows —
 * category, location, then a footer for sort and the list/map toggle. The
 * argument for that was a good one and is worth restating: the directory it
 * replaced hid everything behind a "Filters" button, which costs two clicks
 * before you learn the directory has categories at all, hides what is active
 * once the dialog closes, and gives a phone a full-screen modal to dismiss
 * between every adjustment.
 *
 * What that argument missed is the cost on a phone. Measured at 390x844: the
 * band ended at 336, the three rows and the footer ran to 603, and the first
 * business card started at 627 — 74% of the screen was controls, and the one
 * result you could see was the thing you came for. Filters being visible is
 * worth very little if the businesses are not.
 *
 * So the rows fold into compact controls. Each menu trigger names its own
 * state, category choices repeat underneath as removable chips, and the two
 * boolean filters stay visible as labelled checkboxes. Seeing what is on and
 * turning it off remain one glance and one click without restoring the old
 * wall of controls.
 */
export function FilterBar({
  filters,
  onChange,
  view,
  onViewChange,
  locationShared,
}: FilterBarProps) {
  const categoryOptions: FilterMenuOption[] = profileCategoryList.map(
    (category) => ({ value: category.value, label: category.desc })
  );

  const radiusOptions: FilterMenuOption[] = DIRECTORY_RADIUS_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
      disabledReason:
        option.value !== 'all' && !locationShared
          ? 'Use your location first'
          : undefined,
    })
  );

  const sortOptions: FilterMenuOption[] = SORT_OPTIONS.map((option) => ({
    value: option.key,
    label: option.label,
    // Nearest is meaningless with nothing to measure from, and offering it
    // anyway would produce an order the viewer cannot account for.
    disabledReason:
      option.key === 'nearest' && !locationShared
        ? 'Share your location first'
        : undefined,
  }));

  // Category selections repeat as removable chips. Radius names itself in its
  // trigger, while certification and events remain visible as checkboxes.
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...filters.categories.map((value) => ({
      key: `cat:${value}`,
      label:
        profileCategoryList.find((category) => category.value === value)
          ?.desc ?? value,
      clear: () =>
        onChange({
          ...filters,
          categories: filters.categories.filter((item) => item !== value),
        }),
    })),
  ];
  const hasActiveFilters =
    filters.categories.length > 0 ||
    (locationShared && filters.radius !== 'all') ||
    filters.certifiedOnly ||
    filters.withEventsOnly;

  return (
    <div className="dirsearch-filters">
      <div className="dirsearch-filterinner dirsearch-filterinner--menus">
        <div className="dirsearch-menurow">
          <FilterMenu
            label="Category"
            options={categoryOptions}
            selected={filters.categories}
            onChange={(categories) => onChange({ ...filters, categories })}
          />

          <FilterMenu
            label="Radius"
            options={radiusOptions}
            selected={[filters.radius]}
            single
            defaultValue={locationShared ? 'all' : filters.radius}
            caption={
              locationShared
                ? undefined
                : 'Use your location above to enable a distance radius.'
            }
            onChange={([radius]) =>
              onChange({ ...filters, radius: radius as DirectoryRadius })
            }
          />

          <label
            className="dirsearch-checkfilter"
            data-on={filters.certifiedOnly}
          >
            <input
              type="checkbox"
              className="dirsearch-checkinput"
              checked={filters.certifiedOnly}
              onChange={(event) =>
                onChange({
                  ...filters,
                  certifiedOnly: event.currentTarget.checked,
                })
              }
            />
            <span>Pana Certified</span>
          </label>

          <label
            className="dirsearch-checkfilter"
            data-on={filters.withEventsOnly}
          >
            <input
              type="checkbox"
              className="dirsearch-checkinput"
              checked={filters.withEventsOnly}
              onChange={(event) =>
                onChange({
                  ...filters,
                  withEventsOnly: event.currentTarget.checked,
                })
              }
            />
            <span>Upcoming events</span>
          </label>

          <FilterMenu
            label="Sort"
            options={sortOptions}
            selected={[filters.sort]}
            single
            defaultValue="relevance"
            onChange={([sort]) =>
              onChange({ ...filters, sort: sort as DirectorySort })
            }
          />

          {hasActiveFilters && (
            <button
              type="button"
              className="dirsearch-clear"
              onClick={() =>
                onChange({
                  ...filters,
                  categories: [],
                  radius: locationShared ? 'all' : filters.radius,
                  certifiedOnly: false,
                  withEventsOnly: false,
                })
              }
            >
              Clear
            </button>
          )}

          {/* A map is how you answer "what is near me" when you do not yet
              know what you are looking for, which is most of the time. On a
              wide screen it is not a choice at all: the list and the map are
              side by side and this toggle is hidden. It exists for the widths
              where only one of them fits. */}
          <div className="dirsearch-viewtoggle">
            <button
              type="button"
              data-on={view === 'list'}
              aria-pressed={view === 'list'}
              onClick={() => onViewChange('list')}
            >
              <LayoutList className="h-4 w-4" aria-hidden="true" />
              List
            </button>
            <button
              type="button"
              data-on={view === 'map'}
              aria-pressed={view === 'map'}
              onClick={() => onViewChange('map')}
            >
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              Map
            </button>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="dirsearch-activerow">
            <ul className="dirsearch-chiprow">
              {activeChips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    className="dirsearch-activechip"
                    onClick={chip.clear}
                  >
                    {chip.label}
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Remove filter</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
