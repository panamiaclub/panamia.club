'use client';

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  ChevronDown,
  Globe,
  HelpCircle,
  MapPin,
  Search,
  Sparkles,
  Store,
  Truck,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { projectMockCoordinates } from '@/app/mock/_data/map';
import {
  COUNTIES,
  LISTINGS,
  LOCATION_LABEL,
  countyLabel,
  filterListings,
  getOnlineZipGroups,
  locationDescription,
  mapCoordinatesFor,
  serviceAreasFor,
  type AreaFilter,
  type County,
  type LocationFilter,
  type LocationKind,
  type LocationListing,
} from '../_data/listings';
import styles from './online-directory.module.css';

const LOCATION_ICON = {
  storefront: Store,
  online: Globe,
  mobile: Truck,
  unprovided: HelpCircle,
} satisfies Record<LocationKind, typeof Globe>;

const FILTERS: readonly { id: LocationFilter; label: string }[] = [
  { id: 'all', label: 'All businesses' },
  { id: 'storefront', label: 'Visit in person' },
  { id: 'online', label: 'Online only' },
  { id: 'mobile', label: 'Mobile / by appointment' },
];

const AREAS: readonly { id: AreaFilter; label: string }[] = [
  { id: 'all', label: 'All of South Florida' },
  ...COUNTIES,
];

export function OnlineDirectory() {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<AreaFilter>('all');
  const [kind, setKind] = useState<LocationFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedZip, setFocusedZip] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const focusResultsOnCommit = useRef(false);
  const profileOpener = useRef<HTMLButtonElement | null>(null);
  const resultList = useRef<HTMLUListElement>(null);
  const resultCards = useRef(new Map<string, HTMLLIElement>());
  const searchResults = filterListings({ query, area, kind });
  const onlineGroups = getOnlineZipGroups(searchResults);
  const focusedGroup = onlineGroups.find(
    (group) => group.area.postalCode === focusedZip
  );
  const results = focusedGroup?.items ?? searchResults;
  const pins = searchResults.flatMap((listing) => {
    const coordinates = mapCoordinatesFor(listing);
    return coordinates ? [{ listing, coordinates }] : [];
  });
  const selected = searchResults.find((listing) => listing.id === selectedId);
  const serviceAreas =
    selected?.location.kind === 'mobile' ? serviceAreasFor(selected) : [];
  const profile = LISTINGS.find((listing) => listing.id === profileId);

  function clearSelection() {
    setSelectedId(null);
  }

  function focusBaseZip(zip: string) {
    focusResultsOnCommit.current = true;
    setFocusedZip((current) => (current === zip ? null : zip));
    clearSelection();
  }

  function showAllResults() {
    focusResultsOnCommit.current = true;
    setFocusedZip(null);
    clearSelection();
  }

  useLayoutEffect(() => {
    if (!focusResultsOnCommit.current) return;
    focusResultsOnCommit.current = false;
    const heading = resultsHeading.current;
    heading?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 48rem)').matches) {
      heading?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    }
  }, [focusedZip]);

  useLayoutEffect(() => {
    if (!selectedId) return;
    const list = resultList.current;
    const card = resultCards.current.get(selectedId);
    if (list && card && list.scrollHeight > list.clientHeight) {
      const top =
        card.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        list.scrollTop;
      list.scrollTo({
        top: Math.max(0, top - 8),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    }
  }, [selectedId, focusedZip]);

  function selectListing(listing: LocationListing) {
    setSelectedId(listing.id);
  }

  function openProfile(
    listing: LocationListing,
    event: MouseEvent<HTMLButtonElement>
  ) {
    profileOpener.current = event.currentTarget;
    setProfileId(listing.id);
  }

  function resetFilters() {
    setQuery('');
    setArea('all');
    setKind('all');
    setFocusedZip(null);
    clearSelection();
  }

  return (
    <main className={`dirmock ${styles.page}`}>
      <div className={styles.heading}>
        <div>
          <span className="section-eyebrow">Directory / design preview</span>
          <h1>
            Local finds. <em>More ways to connect.</em>
          </h1>
          <p>
            Visit a storefront, book someone who comes to you, or meet online.
          </p>
        </div>
        <span className={styles.mockBadge}>
          <Sparkles size={15} aria-hidden="true" />
          Interactive mock
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="online-mock-search">
            Search businesses
          </label>
          <input
            id="online-mock-search"
            type="search"
            placeholder="Try wellness, coffee, design..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFocusedZip(null);
              clearSelection();
            }}
          />
        </div>
        <div className={styles.areaSelect}>
          <MapPin size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="online-mock-area">
            Area served
          </label>
          <select
            id="online-mock-area"
            value={area}
            onChange={(event) => {
              const next = AREAS.find(
                (entry) => entry.id === event.target.value
              );
              if (next) {
                setArea(next.id);
                setFocusedZip(null);
                clearSelection();
              }
            }}
          >
            {AREAS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </div>

      <div className={styles.filters} aria-label="How to connect">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={kind === filter.id}
            onClick={() => {
              setKind(filter.id);
              setFocusedZip(null);
              clearSelection();
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className={styles.workspace}>
        <section
          className={styles.results}
          aria-labelledby="online-mock-results"
        >
          <div className={styles.resultsHeading} aria-live="polite">
            <div>
              <h2 ref={resultsHeading} id="online-mock-results" tabIndex={-1}>
                {results.length} {focusedGroup ? 'online ' : ''}
                {results.length === 1 ? 'business' : 'businesses'}
              </h2>
              {focusedGroup && (
                <p>Based near ZIP {focusedGroup.area.postalCode}</p>
              )}
            </div>
            {focusedGroup ? (
              <button
                type="button"
                className={styles.showAll}
                onClick={showAllResults}
              >
                Show all {searchResults.length}
              </button>
            ) : (
              <span>Every way to connect</span>
            )}
          </div>
          <ul
            ref={resultList}
            className={styles.resultList}
            aria-label="Directory results"
          >
            {results.map((listing) => {
              const Icon = LOCATION_ICON[listing.location.kind];
              return (
                <li
                  key={listing.id}
                  ref={(node) => {
                    if (node) resultCards.current.set(listing.id, node);
                    else resultCards.current.delete(listing.id);
                  }}
                  data-listing={listing.id}
                  data-selected={selectedId === listing.id}
                >
                  <article className={styles.card}>
                    <button
                      type="button"
                      className={styles.cardMain}
                      aria-label={`Select ${listing.name}`}
                      aria-pressed={selectedId === listing.id}
                      onClick={() => selectListing(listing)}
                    >
                      <Image
                        src={listing.cover}
                        alt=""
                        width={76}
                        height={86}
                        className={styles.cardPhoto}
                      />
                      <span>
                        <span className={styles.category}>
                          {listing.category}
                        </span>
                        <strong className={styles.cardName}>
                          {listing.name}
                        </strong>
                        <span className={styles.tagline}>
                          {listing.tagline}
                        </span>
                      </span>
                    </button>
                    <div className={styles.cardFoot}>
                      <div>
                        <span
                          className={styles.locationKind}
                          data-kind={listing.location.kind}
                        >
                          <Icon size={14} aria-hidden="true" />
                          {LOCATION_LABEL[listing.location.kind]}
                        </span>
                        {listing.location.kind !== 'unprovided' && (
                          <p>{locationDescription(listing)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className={styles.profileButton}
                        aria-label={`View ${listing.name} profile`}
                        onClick={(event) => openProfile(listing, event)}
                      >
                        <ArrowRight size={18} aria-hidden="true" />
                      </button>
                    </div>
                    {selectedId === listing.id && (
                      <div
                        className={styles.selection}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        <button
                          type="button"
                          className={styles.clearSelection}
                          aria-label="Clear selected business"
                          onClick={() => {
                            clearSelection();
                            resultsHeading.current?.focus({
                              preventScroll: true,
                            });
                          }}
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                        <p>{listing.description}</p>
                        <small>
                          {listing.location.kind === 'storefront'
                            ? 'The pin represents a public place to visit.'
                            : serviceAreas.length > 0
                              ? 'Shading shows where they serve, not where they live.'
                              : listing.location.kind === 'online'
                                ? 'The bubble shows a base ZIP, not delivery coverage. Confirm pickup or delivery with the business.'
                                : 'Their public location has not been provided yet.'}
                        </small>
                        <button
                          type="button"
                          className={styles.selectionProfile}
                          onClick={(event) => openProfile(listing, event)}
                        >
                          View profile{' '}
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
          {results.length === 0 && (
            <div className={styles.empty}>
              <Search size={26} aria-hidden="true" />
              <h3>No matching businesses</h3>
              <p>Try another name, service, or area.</p>
              <button type="button" onClick={resetFilters}>
                Clear filters
              </button>
            </div>
          )}
        </section>

        <section className={styles.mapSection} aria-label="Business map">
          <div className={styles.mapFrame}>
            <div className={styles.map}>
              <MapArtwork serviceAreas={serviceAreas} />
              <div className={styles.mapTitle}>
                <MapPin size={15} aria-hidden="true" />
                South Florida
              </div>

              {pins.map(({ listing, coordinates }, index) => (
                <button
                  key={listing.id}
                  type="button"
                  className={styles.pin}
                  style={projectMockCoordinates(coordinates)}
                  data-pin-kind="storefront"
                  data-selected={selectedId === listing.id}
                  aria-label={`Show ${listing.name} public storefront`}
                  aria-pressed={selectedId === listing.id}
                  onClick={() => {
                    setFocusedZip(null);
                    selectListing(listing);
                  }}
                >
                  <Store size={18} aria-hidden="true" />
                  <span>{index + 1}</span>
                </button>
              ))}

              {onlineGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={styles.onlineBubble}
                  style={projectMockCoordinates(group.area)}
                  data-online-zip={group.area.postalCode}
                  data-online-count={group.items.length}
                  aria-label={`Show ${group.items.length} online ${group.items.length === 1 ? 'business' : 'businesses'} based near ZIP ${group.area.postalCode}`}
                  aria-pressed={focusedZip === group.area.postalCode}
                  aria-controls="online-mock-results"
                  title={`Approximate base ZIP ${group.area.postalCode}, not a visiting address or delivery zone`}
                  onClick={() => focusBaseZip(group.area.postalCode)}
                >
                  <Globe size={18} aria-hidden="true" />
                  <span>{group.area.postalCode}</span>
                  <strong>{group.items.length}</strong>
                </button>
              ))}
              <span className={styles.mapDisclaimer}>
                Illustrated map / approximate ZIP areas, not business addresses
              </span>
            </div>
          </div>
          <div className={styles.legend}>
            <span>
              <Globe size={15} aria-hidden="true" />
              {onlineGroups.length} online ZIP{' '}
              {onlineGroups.length === 1 ? 'area' : 'areas'}
            </span>
            <span>
              <Store size={15} aria-hidden="true" /> {pins.length} public{' '}
              {pins.length === 1 ? 'pin' : 'pins'}
            </span>
            <span>ZIP locations are approximate</span>
          </div>
          <p className={styles.mapHint}>
            {pins.length === 0 &&
              onlineGroups.length === 0 &&
              'No public locations or base ZIPs to map. '}
            Globe bubbles show where online businesses are based, not delivery
            coverage. Contact the business to confirm delivery, pickup, or
            appointment details.
          </p>
        </section>
      </div>

      <p className={styles.footer}>
        Design mock - <code>/mock/directory-online</code>. All listings are
        fixtures; no live directory data is changed. Listing photos from{' '}
        <a href="https://www.pexels.com">Pexels</a>. ZIP-area coordinates from{' '}
        <a href="https://www.geonames.org/">GeoNames</a> via Zippopotam.us,
        under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </p>

      <Dialog
        open={Boolean(profile)}
        onOpenChange={(open) => {
          if (!open) setProfileId(null);
        }}
      >
        <DialogContent
          className={styles.profileDialog}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (profileOpener.current?.isConnected)
              profileOpener.current.focus();
            else resultsHeading.current?.focus({ preventScroll: true });
          }}
        >
          {profile && (
            <>
              <Image
                src={profile.cover}
                alt=""
                width={560}
                height={220}
                className={styles.profileCover}
              />
              <span className={styles.category}>
                Sample profile / {profile.category}
              </span>
              <DialogTitle>{profile.name}</DialogTitle>
              <DialogDescription>{profile.description}</DialogDescription>
              <div className={styles.profileLocation}>
                <strong>{LOCATION_LABEL[profile.location.kind]}</strong>
                <p>{locationDescription(profile)}</p>
                {profile.location.kind === 'storefront' ? (
                  <p>{profile.location.address}</p>
                ) : (
                  <small>
                    No public street address or directions are shown.
                  </small>
                )}
              </div>
              <p className={styles.profileNote}>
                Fixture preview only. This is not a live business profile.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function MapArtwork({ serviceAreas }: { serviceAreas: readonly County[] }) {
  const gridId = useId();
  const regions: readonly { county: County; path: string; y: number }[] = [
    {
      county: 'palm_beach',
      path: 'M0 0H351C348 61 339 80 345 133L338 185H0Z',
      y: 105,
    },
    {
      county: 'broward',
      path: 'M0 185H338C328 222 328 253 327 280L315 335H0Z',
      y: 257,
    },
    {
      county: 'miami_dade',
      path: 'M0 335H315C310 371 312 391 304 435L284 500H0Z',
      y: 417,
    },
  ];

  return (
    <svg
      className={styles.mapArtwork}
      viewBox="0 0 400 500"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={gridId}
          width="31"
          height="27"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M31 0H0V27"
            fill="none"
            stroke="var(--story-cream)"
            strokeWidth="2"
          />
        </pattern>
      </defs>
      <rect width="400" height="500" className={styles.mapLand} />
      <rect width="400" height="500" fill={`url(#${gridId})`} />
      <path
        className={styles.mapPark}
        d="M0 0H97L101 53 84 99 102 151 82 206 95 264 64 319 74 371 55 432 67 500H0Z"
      />
      <path
        className={styles.mapPark}
        d="M178 54H219V92H184ZM146 280H190V318H151ZM240 380H270V423H233Z"
      />
      <path
        className={styles.mapWater}
        d="M351 0C348 61 339 80 345 133S322 209 327 262 309 344 311 387 291 460 284 500H400V0Z"
      />
      <g fill="none" stroke="var(--story-cream)" strokeWidth="7">
        <path d="M93 60H347M83 125H340M99 201H328M82 269H323M66 348H312M59 426H299" />
        <path d="M137 0L144 126 134 268 144 500M225 0L217 157 226 289 210 500" />
      </g>
      <path
        d="M304 -10C300 101 288 132 289 214S273 340 253 510"
        fill="none"
        stroke="var(--story-cream)"
        strokeWidth="11"
      />
      <path
        d="M304 -10C300 101 288 132 289 214S273 340 253 510"
        fill="none"
        className={styles.mapHighway}
        strokeWidth="3"
      />
      {regions.map((region) => (
        <g key={region.county}>
          <path
            d={region.path}
            className={styles.serviceArea}
            data-service-area={region.county}
            data-active={serviceAreas.includes(region.county)}
          />
          <text x="116" y={region.y} className={styles.countyLabel}>
            {countyLabel(region.county)}
          </text>
        </g>
      ))}
      <text
        x="366"
        y="356"
        className={styles.oceanLabel}
        transform="rotate(-90 366 356)"
      >
        ATLANTIC OCEAN
      </text>
      <text
        x="26"
        y="292"
        className={styles.parkLabel}
        transform="rotate(-90 26 292)"
      >
        EVERGLADES
      </text>
    </svg>
  );
}
