'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { Globe, MapPin } from 'lucide-react';
import { nativeMapPins, type NativeResult } from '@/lib/mobile/browse';
import { mapContainsPoint, type MapBounds } from '@/lib/map/viewport';
import {
  nativePreviewHeight,
  nativeSheetHeights,
  type NativeSheetStop,
} from '@/lib/mobile/map-sheet';
import {
  hasOpenNativeOverlay,
  NATIVE_BACK_BUTTON_EVENT,
} from '@/lib/mobile/native';
import {
  frameForPoints,
  type MapFrame,
} from '@/app/directory/search/_lib/map-frame';
import type { MapCanvasPin } from '@/app/directory/search/_components/map-canvas';
import { NativeNotice, NativeResultCard } from './NativeResultCard';
import styles from './native-app.module.css';

const MapCanvas = dynamic(
  () => import('@/app/directory/search/_components/map-canvas'),
  { ssr: false }
);
const STOPS: NativeSheetStop[] = ['peek', 'half', 'expanded'];

export default function NativeMapResults({
  items,
  mapItems = items,
  directorySections = false,
  unmappedCount,
  label,
  count,
  filterKey,
  active,
  loading,
  failed,
  onRetry,
  footer,
  viewer,
  controlsInset,
  onControlsCovered,
}: {
  items: NativeResult[];
  mapItems?: NativeResult[];
  directorySections?: boolean;
  unmappedCount?: number;
  label: string;
  count: string;
  filterKey: string;
  active: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  footer?: ReactNode;
  viewer: { lat: number; lng: number } | null;
  controlsInset: number;
  onControlsCovered: (covered: boolean) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cardNodes = useRef(new Map<string, HTMLDivElement>());
  const [height, setHeight] = useState(0);
  const [stop, setStop] = useState<NativeSheetStop>('peek');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [view, setView] = useState<MapFrame>(() =>
    frameForPoints(nativeMapPins(mapItems).map((pin) => pin.coords))
  );
  const pins = useMemo(() => nativeMapPins(mapItems), [mapItems]);
  const pinKey = pins
    .map((pin) => `${pin.id}:${pin.coords.lat},${pin.coords.lng}`)
    .join('|');
  const latestPins = useRef(pins);
  latestPins.current = pins;
  const inMapItems = useMemo(() => {
    const ids = new Set(
      pins
        .filter((pin) => mapContainsPoint(bounds, pin.coords))
        .flatMap((pin) => pin.items.map((item) => item.id))
    );
    return mapItems.filter((item) => ids.has(item.id));
  }, [pins, mapItems, bounds]);
  const onlineItems = useMemo(() => {
    const ids = new Set(
      pins.flatMap((pin) => pin.items.map((item) => item.id))
    );
    return items.filter((item) => !ids.has(item.id));
  }, [pins, items]);
  const cluster = pins.find((pin) => pin.id === clusterId);
  const results = directorySections
    ? inMapItems.filter((item) => !cluster || cluster.items.includes(item))
    : (cluster?.items ?? items);
  const selected = mapItems.find((item) => item.id === selectedId);
  const preview = previewKey === filterKey && Boolean(selected);
  const visible = preview && selected ? [selected] : results;
  const heights = nativeSheetHeights(height, controlsInset);
  const sheetHeight = Math.min(
    height,
    dragHeight ?? (preview ? (previewHeight ?? heights.half) : heights[stop])
  );
  const covered = height > 0 && height < 250 && sheetHeight > height - 64;
  const wasPreview = useRef(false);
  const previousFilter = useRef(filterKey);
  const drag = useRef<{
    id: number;
    y: number;
    height: number;
    current: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (active) onControlsCovered(covered);
  }, [active, covered, onControlsCovered]);

  useLayoutEffect(() => {
    if (previousFilter.current === filterKey) return;
    previousFilter.current = filterKey;
    setPreviewKey(null);
    setSelectedId(null);
    setClusterId(null);
    setStop('half');
    scroller.current?.scrollTo({ top: 0 });
  }, [filterKey]);

  useEffect(() => {
    setView(frameForPoints(latestPins.current.map((pin) => pin.coords)));
  }, [pinKey, filterKey]);

  const scrollToSelection = useCallback(() => {
    const card = selectedId ? cardNodes.current.get(selectedId) : null;
    const list = scroller.current;
    if (card && list) {
      list.scrollTo({
        top:
          list.scrollTop +
          card.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          12,
      });
    }
  }, [selectedId]);

  useLayoutEffect(() => {
    if (!preview) {
      if (wasPreview.current) scrollToSelection();
      wasPreview.current = false;
      return;
    }
    wasPreview.current = true;
    const card = selectedId ? cardNodes.current.get(selectedId) : null;
    const head = heading.current;
    if (!card || !head || height <= 0) return;
    const fit = () => {
      const next = nativePreviewHeight(
        height,
        head.getBoundingClientRect().height +
          (head.parentElement?.clientTop ?? 0),
        card.getBoundingClientRect().height
      );
      setPreviewHeight((current) => (current === next ? current : next));
      scroller.current?.scrollTo({ top: 0 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    observer.observe(head);
    return () => observer.disconnect();
  }, [preview, height, selectedId, scrollToSelection]);

  const showAll = useCallback(() => {
    setPreviewKey(null);
    setClusterId(null);
    setStop('half');
  }, []);

  useEffect(() => {
    if (!active) return;
    const back = (event: Event) => {
      if (event.defaultPrevented || hasOpenNativeOverlay()) return;
      if (preview || clusterId) {
        event.preventDefault();
        showAll();
      } else if (stop !== 'peek') {
        event.preventDefault();
        setStop('peek');
      }
    };
    window.addEventListener(NATIVE_BACK_BUTTON_EVENT, back);
    return () => window.removeEventListener(NATIVE_BACK_BUTTON_EVENT, back);
  }, [active, preview, clusterId, stop, showAll]);

  const canvasPins: MapCanvasPin[] = pins.map((pin) => ({
    id: pin.id,
    lat: pin.coords.lat,
    lng: pin.coords.lng,
    content: (
      <button
        type="button"
        className={styles.pin}
        data-kind={pin.items[0].kind}
        data-online-zip={pin.zipArea?.postalCode}
        data-approximate={
          pin.items.some((item) => item.approximateZip) || undefined
        }
        aria-label={
          pin.zipArea
            ? `${pin.items.length} online ${pin.items.length === 1 ? 'business' : 'businesses'} based near ZIP ${pin.zipArea.postalCode}`
            : pin.items.length > 1
              ? `${pin.items.length} ${label.toLowerCase()} results at ${pin.items[0].location}`
              : pin.items[0].approximateZip
                ? `${pin.items[0].title}, approximate ZIP ${pin.items[0].approximateZip.postalCode} area`
                : pin.items[0].title
        }
        title={
          pin.zipArea
            ? 'Approximate base ZIP, not a visiting address or delivery zone'
            : pin.items.some((item) => item.approximateZip)
              ? 'Approximate ZIP area, not an exact business location'
              : undefined
        }
        aria-pressed={
          clusterId === pin.id ||
          pin.items.some((item) => item.id === selectedId)
        }
        onClick={() => {
          if (pin.zipArea) {
            setClusterId(pin.id);
            setSelectedId(null);
            setPreviewKey(null);
            setStop('half');
            scroller.current?.scrollTo({ top: 0 });
            return;
          }
          if (!directorySections) {
            setView((current) => ({
              center: [pin.coords.lat, pin.coords.lng],
              zoom: Math.max(12, current.zoom),
            }));
          }
          if (pin.items.length === 1) {
            setClusterId(null);
            setSelectedId(pin.items[0].id);
            setPreviewHeight(null);
            setPreviewKey(filterKey);
          } else {
            setClusterId(pin.id);
            setSelectedId(null);
            setPreviewKey(null);
            setStop('half');
            scroller.current?.scrollTo({ top: 0 });
          }
        }}
      >
        {pin.zipArea ? (
          <>
            <Globe size={18} aria-hidden="true" />
            <b>{pin.zipArea.postalCode}</b>
            <strong>{pin.items.length}</strong>
          </>
        ) : pin.items[0].image || pin.items[0].kind === 'directory' ? (
          <img src={pin.items[0].image || '/img/bg_coconut_blue.jpg'} alt="" />
        ) : (
          <MapPin size={20} aria-hidden="true" />
        )}
        {!pin.zipArea &&
          pin.items.length > 1 &&
          pin.items[0].kind !== 'directory' && <span>{pin.items.length}</span>}
      </button>
    ),
  }));

  const endDrag = (
    event: PointerEvent<HTMLButtonElement>,
    cancelled = false
  ) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (gesture.moved) {
      suppressClick.current = true;
      if (!cancelled) {
        const closest = STOPS.reduce((best, candidate) =>
          Math.abs(heights[candidate] - gesture.current) <
          Math.abs(heights[best] - gesture.current)
            ? candidate
            : best
        );
        setStop(closest);
      }
    }
    setDragHeight(null);
  };

  const unpinned =
    unmappedCount ??
    items.length - pins.reduce((total, pin) => total + pin.items.length, 0);
  const resultCard = (item: NativeResult) => (
    <div
      key={item.id}
      ref={(node) => {
        if (node) cardNodes.current.set(item.id, node);
        else cardNodes.current.delete(item.id);
      }}
    >
      <NativeResultCard item={item} selected={item.id === selectedId} />
    </div>
  );
  return (
    <div
      className={styles.mapResults}
      ref={area}
      data-short={height > 0 && height < 250}
      data-map-results={label}
    >
      <div
        className={styles.mapViewport}
        style={{ bottom: sheetHeight }}
        hidden={height > 0 && sheetHeight >= height}
      >
        <MapCanvas
          view={view}
          onViewChange={setView}
          pins={canvasPins}
          viewer={viewer}
          hasZipAreas={pins.some(
            (pin) =>
              Boolean(pin.zipArea) ||
              pin.items.some((item) => item.approximateZip)
          )}
          onBoundsChange={directorySections ? setBounds : undefined}
        />
        {unpinned > 0 && (
          <p className={styles.offMap}>
            <Globe size={13} aria-hidden="true" />
            {unpinned}{' '}
            {directorySections
              ? 'without usable map locations, in Online below'
              : 'without map coordinates, included below'}
          </p>
        )}
      </div>

      <section
        className={styles.sheet}
        style={{ height: sheetHeight || 118 }}
        aria-label={`${label} results`}
        data-preview={preview || undefined}
      >
        <header className={styles.sheetHeader} ref={heading}>
          <button
            type="button"
            className={styles.sheetHandle}
            aria-label="Resize results"
            aria-expanded={stop !== 'peek' || preview}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              setPreviewKey(null);
              setStop(STOPS[(STOPS.indexOf(stop) + 1) % STOPS.length]);
            }}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 'peek'
                  : event.key === 'End'
                    ? 'expanded'
                    : event.key === 'ArrowUp'
                      ? STOPS[Math.min(2, STOPS.indexOf(stop) + 1)]
                      : event.key === 'ArrowDown'
                        ? STOPS[Math.max(0, STOPS.indexOf(stop) - 1)]
                        : null;
              if (next) {
                event.preventDefault();
                setPreviewKey(null);
                setStop(next);
              } else if (event.key === 'Escape') {
                setPreviewKey(null);
                setClusterId(null);
                setStop('peek');
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              suppressClick.current = false;
              drag.current = {
                id: event.pointerId,
                y: event.clientY,
                height: sheetHeight,
                current: sheetHeight,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const gesture = drag.current;
              if (!gesture || gesture.id !== event.pointerId) return;
              const delta = gesture.y - event.clientY;
              if (!gesture.moved && Math.abs(delta) < 5) return;
              gesture.moved = true;
              setPreviewKey(null);
              gesture.current = Math.max(
                heights.peek,
                Math.min(heights.expanded, gesture.height + delta)
              );
              setDragHeight(gesture.current);
            }}
            onPointerUp={(event) => endDrag(event)}
            onPointerCancel={(event) => endDrag(event, true)}
          >
            <span aria-hidden="true" />
          </button>
          <div className={styles.sheetHeading}>
            <h2>
              {cluster?.zipArea
                ? `${results.length} online near ZIP ${cluster.zipArea.postalCode}`
                : cluster
                  ? `${results.length} at this location`
                  : count}
            </h2>
            <button
              type="button"
              onClick={() => {
                if (preview || cluster) showAll();
                else
                  setStop((current) =>
                    current === 'expanded' ? 'peek' : 'expanded'
                  );
              }}
            >
              {preview || cluster
                ? 'Show all'
                : stop === 'expanded'
                  ? 'Map'
                  : 'List'}
            </button>
          </div>
        </header>
        <div className={styles.sheetList} ref={scroller}>
          {loading && (
            <NativeNotice title={`Loading ${label.toLowerCase()}...`} busy />
          )}
          {failed && (
            <NativeNotice
              title={`Could not load ${label.toLowerCase()}`}
              onRetry={onRetry}
            >
              This is a loading problem, not an empty search.
            </NativeNotice>
          )}
          {!loading && !failed && items.length === 0 && (
            <NativeNotice title="No matches">
              Try a different search or category.
            </NativeNotice>
          )}
          {!preview && directorySections ? (
            <>
              <section className={styles.resultSection} aria-label="In map">
                <h3>
                  In map <span>{visible.length}</span>
                </h3>
                <p className={styles.resultSectionCopy}>
                  Businesses in the visible map area. ZIP-area locations are
                  approximate.
                </p>
                {visible.map(resultCard)}
                {!loading && !failed && visible.length === 0 && (
                  <p className={styles.resultSectionCopy}>
                    No matches in this map area. Move or zoom out on the map to
                    see more.
                  </p>
                )}
              </section>
              <section className={styles.resultSection} aria-label="Online">
                <h3>
                  Online <span>{onlineItems.length}</span>
                </h3>
                <p className={styles.resultSectionCopy}>
                  Listings without a usable map location. This does not imply
                  online service.
                </p>
                {onlineItems.map(resultCard)}
                {!loading && !failed && onlineItems.length === 0 && (
                  <p className={styles.resultSectionCopy}>
                    No matching listings without a map location.
                  </p>
                )}
              </section>
            </>
          ) : (
            visible.map(resultCard)
          )}
          {!preview && !cluster && !directorySections && footer}
        </div>
      </section>
      <p className="sr-only" aria-live="polite">
        {preview && selected ? `Selected ${selected.title}` : ''}
      </p>
    </div>
  );
}
