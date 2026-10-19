'use client';

import Link from 'next/link';
import { ArrowRight, SearchX } from 'lucide-react';
import { profileCategoryList } from '@/lib/lists';
import type { FilterState } from './filter-bar';

interface EmptyStateProps {
  term: string;
  filters: FilterState;
  radiusActive: boolean;
  onChange: (next: FilterState) => void;
  onTermChange: (next: string) => void;
}

/**
 * What the page says when nothing matched.
 *
 * The directory this replaces printed one grey sentence — "No results found.
 * Try a different search term or adjust your filters" — which restates the
 * problem and leaves the visitor to solve it. A dead end here is expensive:
 * the directory is small enough that a near-miss search is normal, and this is
 * exactly the moment someone decides the site is empty and leaves.
 *
 * So this does the adjusting for them. If filters are on, the first offer is
 * to drop them, because that is the likeliest cause and the visitor may not
 * remember setting them. Then categories as one-click escapes, and only after
 * that the suggestion to tell us what is missing.
 */
export function EmptyState({
  term,
  filters,
  radiusActive,
  onChange,
  onTermChange,
}: EmptyStateProps) {
  const activeFilterCount =
    filters.categories.length +
    (radiusActive && filters.radius !== 'all' ? 1 : 0) +
    (filters.certifiedOnly ? 1 : 0) +
    (filters.withEventsOnly ? 1 : 0);

  const cleared: FilterState = {
    ...filters,
    categories: [],
    radius: radiusActive ? 'all' : filters.radius,
    certifiedOnly: false,
    withEventsOnly: false,
  };

  return (
    <div className="dirsearch-empty">
      <SearchX className="h-9 w-9" aria-hidden="true" />

      <h2 className="dirsearch-empty-title">
        {term ? (
          <>
            Nothing matched <em>{term}</em>
          </>
        ) : (
          <>Nothing matched those filters</>
        )}
      </h2>

      <p className="dirsearch-empty-lede">
        {activeFilterCount > 0
          ? `You have ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} on. Widening usually finds it.`
          : 'The directory is still growing — try a broader word, or browse a category.'}
      </p>

      <div className="dirsearch-empty-actions">
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="dirsearch-empty-primary"
            onClick={() => onChange(cleared)}
          >
            Clear filters and search again
          </button>
        )}
        {term && (
          <button
            type="button"
            className="dirsearch-empty-secondary"
            onClick={() => onTermChange('')}
          >
            Browse everything instead
          </button>
        )}
      </div>

      <p className="dirsearch-empty-or">Or start from a category</p>

      <ul className="dirsearch-empty-cats">
        {profileCategoryList.slice(0, 8).map((category) => (
          <li key={category.value}>
            <button
              type="button"
              onClick={() => {
                onTermChange('');
                onChange({ ...cleared, categories: [category.value] });
              }}
            >
              {category.desc}
            </button>
          </li>
        ))}
      </ul>

      <Link href="/form/contact-us" className="link-arrow mt-9 inline-flex">
        Know a local spot we are missing? Tell us
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
