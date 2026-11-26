'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Search,
  Store,
  Users,
  Eye,
  EyeOff,
  ArrowUpRight,
  RotateCcw,
  FlaskConical,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/Admin/parts';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  isNewDirectoryBusiness,
  type DirectoryBusiness,
} from '@/lib/admin/directory';
import { listingPublicPath } from '@/lib/listing-url';
import styles from './directory-dashboard.module.css';

type Filter = 'all' | 'active' | 'inactive' | 'new';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All profiles' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'new', label: 'New in 30 days' },
];

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));

export function DirectoryDashboard({
  businesses,
  asOf,
  loading = false,
  loadError,
  actionError,
  busyId,
  exporting = false,
  notice,
  onStatusChange,
  onExport,
  onReload,
  onReset,
}: {
  businesses: readonly DirectoryBusiness[];
  asOf: string;
  loading?: boolean;
  loadError?: string;
  actionError?: string;
  busyId?: string | null;
  exporting?: boolean;
  notice: string;
  onStatusChange: (business: DirectoryBusiness) => void;
  onExport: () => void;
  onReload?: () => void;
  onReset?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const mock = Boolean(onReset);
  const unavailable = !ready || loading || Boolean(loadError);
  const isNewBusiness = (business: DirectoryBusiness) =>
    isNewDirectoryBusiness(business, asOf);

  useEffect(() => setReady(true), []);

  const counts = {
    all: businesses.length,
    active: businesses.filter((business) => business.active).length,
    inactive: businesses.filter((business) => !business.active).length,
    new: businesses.filter(isNewBusiness).length,
  };
  const needle = query.trim().toLowerCase();
  const visible = businesses.filter((business) => {
    const matchesStatus =
      filter === 'all' ||
      (filter === 'active' && business.active) ||
      (filter === 'inactive' && !business.active) ||
      (filter === 'new' && isNewBusiness(business));
    return (
      matchesStatus &&
      [
        business.name,
        business.owner,
        business.email,
        business.location,
        business.category,
      ].some((value) => value.toLowerCase().includes(needle))
    );
  });

  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / 25) - 1)
  );
  const pageRows = visible.slice(currentPage * 25, (currentPage + 1) * 25);

  const metrics = [
    {
      id: 'all',
      label: 'Total profiles',
      value: counts.all,
      note: 'All businesses in the directory',
      icon: Store,
    },
    {
      id: 'new',
      label: 'New in the last 30 days',
      value: counts.new,
      note: `As of ${dateLabel(asOf)} (UTC)`,
      icon: Users,
    },
    {
      id: 'active',
      label: 'Active profiles',
      value: counts.active,
      note: 'Visible in the public directory',
      icon: Eye,
    },
    {
      id: 'inactive',
      label: 'Inactive profiles',
      value: counts.inactive,
      note: 'Hidden, not deleted',
      icon: EyeOff,
    },
  ] as const;

  return (
    <div
      className={mock ? styles.page : styles.dashboard}
      data-directory-mock-ready={mock ? ready : undefined}
      data-directory-ready={ready}
    >
      <div className={styles.workspace}>
        {onReset && (
          <div className={styles.mockBar}>
            <span>
              <FlaskConical size={15} aria-hidden="true" /> Interactive design
              mock
            </span>
            <span>Sample businesses only. Changes reset on reload.</span>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                onReset();
                setQuery('');
                setFilter('all');
                setPage(0);
              }}
            >
              <RotateCcw size={13} aria-hidden="true" /> Reset mock
            </button>
          </div>
        )}

        {mock && (
          <div className={styles.breadcrumb}>
            Pana MIA / Back office / <strong>Directory</strong>
          </div>
        )}
        <AdminPageHeader
          eyebrow="Directory management"
          title={
            <>
              A pulse on <span className="text-pana-indigo">local.</span>
            </>
          }
          description={
            <p>
              Your directory, at a glance. Keep business profiles current and
              your community connected.
            </p>
          }
          action={
            <div className={styles.export}>
              <Button
                className="bg-pana-blue text-pana-ink hover:bg-pana-blue/80 rounded-xl font-bold"
                onClick={onExport}
                disabled={unavailable || exporting || Boolean(busyId)}
              >
                <Download aria-hidden="true" />{' '}
                {exporting ? 'Downloading CSV...' : 'Download businesses CSV'}
              </Button>
              <span>
                {loading || loadError
                  ? 'All statuses, independent of filters'
                  : `All ${counts.all}${mock ? ' sample' : ''} businesses, across all statuses`}
              </span>
              {!mock && (
                <a
                  className="text-center text-xs font-bold underline"
                  href="#application-review"
                >
                  Review applications below
                </a>
              )}
            </div>
          }
        />

        <section className={styles.metrics} aria-label="Directory statistics">
          {metrics.map(({ id, label, value, note, icon: Icon }) => (
            <div className={styles.metric} key={id} data-tone={id}>
              <div>
                <h2>{label}</h2>
                <Icon size={19} aria-hidden="true" />
              </div>
              <p className={styles.number} data-testid={`count-${id}`}>
                {loading || loadError ? '-' : value}
              </p>
              <p>{note}</p>
            </div>
          ))}
        </section>

        <div className={styles.sectionHeading} id="business-profiles">
          <div>
            <h2>Business profiles</h2>
            <p>A little housekeeping goes a long way.</p>
          </div>
          <span>
            {mock ? 'Sample snapshot' : 'Updated'}: {dateLabel(asOf)}
          </span>
        </div>

        {actionError && (
          <p
            role="alert"
            className="border-pana-red mb-4 rounded-lg border bg-white p-4 text-sm font-bold"
          >
            {actionError}
          </p>
        )}
        {loading ? (
          <p role="status" className="py-8 text-sm">
            Loading directory businesses...
          </p>
        ) : loadError ? (
          <div
            role="alert"
            className="border-pana-red rounded-lg border bg-white p-4 text-sm"
          >
            <p>{loadError}</p>
            <Button className="mt-3" variant="outline" onClick={onReload}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <section className={styles.panel} aria-label="Business profiles">
              <div className={styles.toolbar}>
                <div
                  className={styles.filters}
                  role="group"
                  aria-label="Filter profiles"
                >
                  {FILTERS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      disabled={unavailable}
                      aria-pressed={filter === id}
                      onClick={() => {
                        setFilter(id);
                        setPage(0);
                      }}
                    >
                      {label} <span>{counts[id]}</span>
                    </button>
                  ))}
                </div>
                <label className={styles.search}>
                  <Search size={17} aria-hidden="true" />
                  <input
                    aria-label="Search businesses"
                    placeholder="Search business, owner, or location"
                    value={query}
                    disabled={unavailable}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              </div>
              <div className={styles.tableScroll}>
                <table>
                  <caption className="sr-only">
                    {mock ? 'Sample directory' : 'Directory'} businesses, newest
                    first
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Business</th>
                      <th scope="col">Owner / contact</th>
                      <th scope="col">Date added</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={styles.actionCell}>
                        Manage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((business, index) => (
                      <tr key={business.id}>
                        <td>
                          <div className={styles.identity}>
                            <span
                              className={styles.avatar}
                              data-tone={index % 4}
                              aria-hidden="true"
                            >
                              {business.name
                                .split(' ')
                                .slice(0, 2)
                                .map((word) => word[0])
                                .join('')}
                            </span>
                            <div>
                              <strong>
                                {!mock && business.active ? (
                                  <Link
                                    className="underline underline-offset-2"
                                    href={listingPublicPath(business)}
                                  >
                                    {business.name}
                                  </Link>
                                ) : (
                                  business.name
                                )}
                              </strong>
                              <small>
                                {business.category} / {business.location}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span>{business.owner}</span>
                          <small>{business.email}</small>
                        </td>
                        <td>
                          <span>{dateLabel(business.joined)}</span>
                          {isNewBusiness(business) && (
                            <small className={styles.newLabel}>
                              New in 30 days
                            </small>
                          )}
                        </td>
                        <td>
                          <span
                            className={styles.status}
                            data-active={business.active}
                          >
                            <span aria-hidden="true" />
                            {business.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className={styles.actionCell}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className={styles.manage}
                                type="button"
                                disabled={unavailable || Boolean(busyId)}
                                aria-label={`${business.active ? 'Deactivate' : 'Reactivate'} ${business.name}`}
                              >
                                {business.active ? (
                                  <EyeOff size={14} aria-hidden="true" />
                                ) : (
                                  <Eye size={14} aria-hidden="true" />
                                )}
                                {busyId === business.id
                                  ? 'Saving...'
                                  : business.active
                                    ? 'Deactivate'
                                    : 'Reactivate'}
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-pana-cream text-pana-ink w-[calc(100%-2rem)] rounded-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {business.active
                                    ? 'Deactivate'
                                    : 'Reactivate'}{' '}
                                  {business.name}?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-pana-ink/75">
                                  {business.active
                                    ? 'This hides the business from the public directory without deleting its profile. You can reactivate it anytime. This does not suspend the owner account.'
                                    : 'This makes the business visible in the public directory again.'}{' '}
                                  {mock
                                    ? 'This mock only changes sample data; no emails are sent.'
                                    : 'No notification email will be sent.'}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className={
                                    business.active
                                      ? 'bg-pana-red hover:bg-pana-red/90 text-white'
                                      : 'bg-pana-blue text-pana-ink hover:bg-pana-blue/80'
                                  }
                                  onClick={() => onStatusChange(business)}
                                  disabled={Boolean(busyId)}
                                >
                                  {business.active
                                    ? 'Deactivate profile'
                                    : 'Reactivate profile'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={5} className={styles.empty}>
                          <Search size={25} aria-hidden="true" />
                          <strong>No businesses match your filters</strong>
                          <p>
                            Try a different name, location, or profile status.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setQuery('');
                              setFilter('all');
                              setPage(0);
                            }}
                          >
                            Clear filters
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className={styles.tableFooter}>
                <span>
                  Showing {visible.length ? currentPage * 25 + 1 : 0}-
                  {Math.min((currentPage + 1) * 25, visible.length)} of{' '}
                  {visible.length} matching businesses ({counts.all} total)
                </span>
                {visible.length > 25 ? (
                  <span>
                    <button
                      type="button"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {currentPage + 1}</span>
                    <button
                      type="button"
                      disabled={(currentPage + 1) * 25 >= visible.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </span>
                ) : (
                  <span>
                    Newest profiles first{' '}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </span>
                )}
              </footer>
            </section>
          </>
        )}

        <div className={styles.bottomNote}>
          <EyeOff size={18} aria-hidden="true" />
          <p>
            <strong>Deactivate, don&apos;t delete.</strong> Keep the profile and
            contact details on file. Bring a business back whenever it&apos;s
            ready.
          </p>
        </div>
        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </div>
  );
}
