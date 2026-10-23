'use client';

import {
  BadgeCheck,
  CalendarDays,
  LayoutList,
  Map as MapIcon,
  RotateCcw,
} from 'lucide-react';
import { countyList, profileCategoryList } from '@/lib/lists';
import {
  COUNTY_LABEL,
  SORT_OPTIONS,
  type QueryState,
  type SortKey,
} from '../_data';

export type ResultView = 'list' | 'map';

interface FilterBarProps {
  query: QueryState;
  onChange: (next: QueryState) => void;
  view: ResultView;
  onViewChange: (next: ResultView) => void;
  /** Disables "Nearest" until there is a location to measure from. */
  locationShared: boolean;
}

/**
 * Refinement, in the open.
 *
 * The current directory hides every filter behind a dialog with a "Filters"
 * button. That costs two clicks before you learn the directory even has
 * categories, hides which ones are active once it closes, and gives a phone
 * user a full-screen modal to dismiss between every adjustment.
 *
 * Here the choices are chips on the page. You can see what is available, see
 * what is on, and turn one off by clicking it — refining a search should not
 * be a form you submit.
 */
export function FilterBar({
  query,
  onChange,
  view,
  onViewChange,
  locationShared,
}: FilterBarProps) {
  const activeCount =
    query.categories.length +
    query.counties.length +
    (query.certifiedOnly ? 1 : 0) +
    (query.openToEvents ? 1 : 0);

  return (
    <div className="dirmock-filters">
      <div className="dirmock-filterinner">
        <div className="dirmock-selects">
          <label>
            <span>Category</span>
            <select
              value={query.categories[0] ?? ''}
              onChange={(event) =>
                onChange({
                  ...query,
                  categories: event.target.value ? [event.target.value] : [],
                })
              }
            >
              <option value="">All categories</option>
              {profileCategoryList.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.desc}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Area</span>
            <select
              value={query.counties[0] ?? ''}
              onChange={(event) =>
                onChange({
                  ...query,
                  counties: event.target.value ? [event.target.value] : [],
                })
              }
            >
              <option value="">All South Florida</option>
              {[...countyList].reverse().map((county) => (
                <option key={county.value} value={county.value}>
                  {COUNTY_LABEL[county.value] ?? county.desc}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Sort</span>
            <select
              value={query.sort}
              onChange={(event) =>
                onChange({ ...query, sort: event.target.value as SortKey })
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.key}
                  value={option.key}
                  // Nearest is meaningless with nothing to measure from, and
                  // offering it anyway would produce an order the viewer
                  // cannot account for.
                  disabled={option.key === 'nearest' && !locationShared}
                >
                  {option.label}
                  {option.key === 'nearest' && !locationShared
                    ? ' — share location first'
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dirmock-softfilters">
          <button
            type="button"
            data-on={query.certifiedOnly}
            aria-pressed={query.certifiedOnly}
            onClick={() =>
              onChange({ ...query, certifiedOnly: !query.certifiedOnly })
            }
          >
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            Pana Certified
          </button>
          <button
            type="button"
            data-on={query.openToEvents}
            aria-pressed={query.openToEvents}
            onClick={() =>
              onChange({ ...query, openToEvents: !query.openToEvents })
            }
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Events soon
          </button>

          {activeCount > 0 && (
            <button
              type="button"
              className="dirmock-clear"
              onClick={() =>
                onChange({
                  ...query,
                  categories: [],
                  counties: [],
                  certifiedOnly: false,
                  openToEvents: false,
                })
              }
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </button>
          )}
        </div>

        <div className="dirmock-viewtoggle">
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
    </div>
  );
}
