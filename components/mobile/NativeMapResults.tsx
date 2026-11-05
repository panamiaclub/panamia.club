'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronUp, Globe, MapPin } from 'lucide-react';
import { nativeMapPins, type NativeResult } from '@/lib/mobile/browse';
import { mapContainsPoint, type MapBounds } from '@/lib/map/viewport';
import {
  NATIVE_SHEET_STOPS as STOPS,
  nativePreviewHeight,
  nativePreviewRange,
  nativeSheetHeights,
  nativeSheetStopForDrag,
  type NativeSheetStop,
} from '@/lib/mobile/map-sheet';
import {
  hasOpenNativeOverlay,
  NATIVE_BACK_BUTTON_EVENT,
} from '@/lib/mobile/native';
import {
  FALLBACK_MAP_PX,
  frameForPoints,
  onResultsArrived,
  viewerFrame,
  type MapFrame,
} from '@/app/directory/search/_lib/map-frame';
import type { MapCanvasPin } from '@/app/directory/search/_components/map-canvas';
import { NativeNotice, NativeResultCard } from './NativeResultCard';
import styles from './native-app.module.css';

const MapCanvas = dynamic(
  () => import('@/app/directory/search/_components/map-canvas'),
  { ssr: false }
);
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
  const viewport = useRef<HTMLDivElement>(null);
  const viewerFramePending = useRef(false);
  const frameSize = useRef(FALLBACK_MAP_PX);
  const heading = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const collections = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cardNodes = useRef(new Map<string, HTMLDivElement>());
  const [{ height, dockSpace }, setSize] = useState({
    height: 0,
    dockSpace: 0,
  });
  const [stop, setStop] = useState<NativeSheetStop>('peek');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [collection, setCollection] = useState<'mapped' | 'online'>('mapped');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const sheetId = useId();
  const [view, setView] = useState<MapFrame>(() =>
    frameForPoints(nativeMapPins(mapItems).map((pin) => pin.coords))
  );
  const pins = useMemo(() => nativeMapPins(mapItems), [mapItems]);
  const pinKey = pins
    .map((pin) => `${pin.id}:${pin.coords.lat},${pin.coords.lng}`)
    .join('|');
  const latestPins = useRef(pins);
  latestPins.current = pins;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
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
  const results = directorySections
    ? collection === 'mapped'
      ? inMapItems
      : onlineItems
    : items;
  const selectedIndex = results.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? results[selectedIndex] : null;
  const preview = previewKey === filterKey && Boolean(selected);
  const availableHeight = Math.max(0, height - dockSpace);
  const short = availableHeight > 0 && availableHeight < 350;
  const range = nativePreviewRange(
    results.length,
    selectedIndex,
    short ? 1 : 2
  );
  const previewFirstId = results[range.start]?.id;
  const previewLastId = results[range.end - 1]?.id;
  const heights = nativeSheetHeights(availableHeight, controlsInset);
  const cameraBottom = Math.min(
    dockSpace + heights.peek,
    Math.max(0, height - 1)
  );
  const cameraTop = Math.min(
    controlsInset,
    Math.max(0, height - cameraBottom - 44)
  );
  const measured = height > 0;
  const sheetHeight = Math.min(
    availableHeight,
    preview ? (previewHeight ?? heights.half) : heights[stop]
  );
  const covered =
    height > 0 && availableHeight < 250 && availableHeight - sheetHeight < 64;
  const coveredRef = useRef(covered);
  const previousFilter = useRef(filterKey);
  const drag = useRef<{
    id: number;
    y: number;
    height: number;
    current: number;
    moved: boolean;
    target: HTMLElement;
  } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const box = viewport.current?.getBoundingClientRect();
    if (box && measured) {
      frameSize.current = Math.max(
        1,
        Math.min(box.width, height - cameraTop - cameraBottom)
      );
    }
  }, [height, measured, cameraTop, cameraBottom]);

  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height <= 0 || !sheet.current) return;
      const bottom = parseFloat(getComputedStyle(sheet.current).bottom);
      setSize({ height: entry.contentRect.height, dockSpace: bottom });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    area.current?.style.setProperty(
      '--native-sheet-height',
      `${sheetHeight || 54}px`
    );
  }, [heights.peek, sheetHeight]);

  useEffect(() => {
    coveredRef.current = covered;
    if (active) onControlsCovered(covered);
  }, [active, covered, onControlsCovered]);

  useLayoutEffect(() => {
    if (previousFilter.current === filterKey) return;
    previousFilter.current = filterKey;
    setPreviewKey(null);
    setSelectedId(null);
    setCollection('mapped');
    setStop('half');
    scroller.current?.scrollTo({ top: 0 });
  }, [filterKey]);

  useEffect(() => {
    const decision = onResultsArrived(
      viewerFramePending.current,
      latestPins.current.length
    );
    viewerFramePending.current = decision.viewerFramePending;
    if (!decision.reframe) return;
    setView(
      frameForPoints(
        latestPins.current.map((pin) => pin.coords),
        frameSize.current
      )
    );
  }, [pinKey, filterKey, measured]);

  // Successful location requests publish a new viewer object, including repeat taps.
  useEffect(() => {
    if (!directorySections || !viewer) {
      viewerFramePending.current = false;
      return;
    }
    viewerFramePending.current = loadingRef.current;
    setView(viewerFrame(viewer, frameSize.current));
    setSelectedId(null);
    setCollection('mapped');
    setPreviewKey(null);
  }, [directorySections, viewer]);

  const scrollToSelection = useCallback(() => {
    const anchorId = preview ? previewFirstId : selectedId;
    const card = anchorId ? cardNodes.current.get(anchorId) : null;
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
  }, [selectedId, preview, previewFirstId]);

  useLayoutEffect(() => {
    if (!preview) return;
    const first = previewFirstId ? cardNodes.current.get(previewFirstId) : null;
    const last = previewLastId ? cardNodes.current.get(previewLastId) : null;
    const head = heading.current;
    const panel = sheet.current;
    if (!first || !last || !head || !panel || height <= 0) return;
    const fit = () => {
      const next = nativePreviewHeight(
        heights.expanded,
        head.getBoundingClientRect().height +
          (collections.current?.getBoundingClientRect().height ?? 0) +
          panel.offsetHeight -
          panel.clientHeight,
        last.getBoundingClientRect().bottom - first.getBoundingClientRect().top
      );
      setPreviewHeight((current) => (current === next ? current : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(first);
    observer.observe(last);
    observer.observe(head);
    if (collections.current) observer.observe(collections.current);
    return () => observer.disconnect();
  }, [
    preview,
    height,
    heights.expanded,
    previewFirstId,
    previewLastId,
    selectionRequest,
  ]);

  useLayoutEffect(() => {
    if (selected) scrollToSelection();
  }, [
    selectedId,
    preview,
    previewHeight,
    sheetHeight,
    collection,
    scrollToSelection,
    selectionRequest,
  ]);

  useEffect(() => {
    if (!active) return;
    const back = (event: Event) => {
      if (event.defaultPrevented || hasOpenNativeOverlay()) return;
      if (preview || stop !== 'peek') {
        event.preventDefault();
        setPreviewKey(null);
        setStop('peek');
      } else if (collection !== 'mapped') {
        event.preventDefault();
        setCollection('mapped');
      }
    };
    window.addEventListener(NATIVE_BACK_BUTTON_EVENT, back);
    return () => window.removeEventListener(NATIVE_BACK_BUTTON_EVENT, back);
  }, [active, preview, collection, stop]);

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
        aria-pressed={pin.items.some((item) => item.id === selectedId)}
        onClick={() => {
          const first = (directorySections ? inMapItems : items).find((item) =>
            pin.items.some((member) => member.id === item.id)
          );
          if (!first) return;
          setCollection('mapped');
          setSelectedId(first.id);
          setSelectionRequest((request) => request + 1);
          setPreviewHeight(null);
          setPreviewKey(filterKey);
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

  const moveSheet = (nextHeight: number) => {
    area.current?.style.setProperty('--native-sheet-height', `${nextHeight}px`);
    const nextCovered =
      height > 0 && availableHeight < 250 && availableHeight - nextHeight < 64;
    if (active && nextCovered !== coveredRef.current) {
      coveredRef.current = nextCovered;
      onControlsCovered(nextCovered);
    }
  };

  const endDrag = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    if (gesture.target.hasPointerCapture(event.pointerId)) {
      gesture.target.releasePointerCapture(event.pointerId);
    }
    if (gesture.moved) {
      suppressClick.current = !cancelled && gesture.target === handle.current;
      if (!cancelled) {
        const next = nativeSheetStopForDrag(
          heights,
          gesture.height,
          gesture.current
        );
        setPreviewKey(null);
        setStop(next);
        moveSheet(heights[next]);
        return;
      }
    }
    moveSheet(gesture.height);
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
      data-short={short}
      data-map-results={label}
    >
      <div
        className={styles.mapViewport}
        ref={viewport}
        hidden={height > 0 && sheetHeight >= availableHeight}
      >
        <MapCanvas
          view={view}
          onViewChange={setView}
          pins={canvasPins}
          viewer={viewer}
          cameraInsets={{
            bottom: cameraBottom,
            top: cameraTop,
          }}
          hasZipAreas={pins.some(
            (pin) =>
              Boolean(pin.zipArea) ||
              pin.items.some((item) => item.approximateZip)
          )}
          onBoundsChange={directorySections ? setBounds : undefined}
        />
      </div>

      <section
        className={styles.sheet}
        ref={sheet}
        aria-label={`${label} results`}
        data-preview={preview || undefined}
        data-collapsed={!preview && stop === 'peek'}
        data-stop={preview ? 'preview' : stop}
      >
        <header
          className={styles.sheetHeader}
          ref={heading}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0 || drag.current) return;
            const button =
              event.target instanceof Element
                ? event.target.closest('button')
                : null;
            if (button && button !== handle.current) return;
            const target = button ?? event.currentTarget;
            suppressClick.current = false;
            drag.current = {
              id: event.pointerId,
              y: event.clientY,
              height: sheetHeight,
              current: sheetHeight,
              moved: false,
              target,
            };
            target.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const gesture = drag.current;
            if (!gesture || gesture.id !== event.pointerId) return;
            const delta = gesture.y - event.clientY;
            if (!gesture.moved && Math.abs(delta) < 5) return;
            gesture.moved = true;
            gesture.current = Math.max(
              heights.peek,
              Math.min(heights.expanded, gesture.height + delta)
            );
            // Move the sheet without re-rendering every pin and result card.
            moveSheet(gesture.current);
          }}
          onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)}
          onLostPointerCapture={(event) => endDrag(event, true)}
        >
          <span className={styles.sheetGrip} aria-hidden="true" />
          <div className={styles.sheetHeading}>
            <h2>{count}</h2>
            <span className={styles.sheetMapCount}>
              <b>{inMapItems.length}</b> in map
            </span>
          </div>
          <button
            type="button"
            className={styles.sheetHandle}
            ref={handle}
            aria-label="Resize results"
            aria-expanded={stop !== 'peek' || preview}
            onClick={(event) => {
              if (event.detail > 0 && suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              suppressClick.current = false;
              setPreviewKey(null);
              setStop(preview || stop !== 'peek' ? 'peek' : 'expanded');
            }}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 'peek'
                  : event.key === 'End'
                    ? 'expanded'
                    : event.key === 'ArrowUp'
                      ? preview
                        ? 'expanded'
                        : STOPS[Math.min(2, STOPS.indexOf(stop) + 1)]
                      : event.key === 'ArrowDown'
                        ? STOPS[Math.max(0, STOPS.indexOf(stop) - 1)]
                        : null;
              if (next) {
                event.preventDefault();
                setPreviewKey(null);
                setStop(next);
              } else if (event.key === 'Escape') {
                setPreviewKey(null);
                setStop('peek');
              }
            }}
          >
            {preview || stop !== 'peek' ? (
              <ChevronDown size={20} aria-hidden="true" />
            ) : (
              <ChevronUp size={20} aria-hidden="true" />
            )}
          </button>
        </header>
        <div
          className={styles.sheetContent}
          inert={!preview && stop === 'peek'}
        >
          {directorySections && (
            <div
              className={styles.sheetCollections}
              ref={collections}
              role="tablist"
              aria-label="Listing locations"
            >
              <button
                type="button"
                role="tab"
                id={`${sheetId}-mapped-tab`}
                aria-controls={`${sheetId}-mapped`}
                aria-selected={collection === 'mapped'}
                onClick={() => {
                  setCollection('mapped');
                  setPreviewKey(null);
                  setStop((current) => (current === 'peek' ? 'half' : current));
                  scroller.current?.scrollTo({ top: 0 });
                }}
              >
                In map {inMapItems.length}
              </button>
              <button
                type="button"
                role="tab"
                id={`${sheetId}-online-tab`}
                aria-controls={`${sheetId}-online`}
                aria-selected={collection === 'online'}
                onClick={() => {
                  setCollection('online');
                  setPreviewKey(null);
                  setStop((current) => (current === 'peek' ? 'half' : current));
                  scroller.current?.scrollTo({ top: 0 });
                }}
              >
                Online {onlineItems.length}
              </button>
            </div>
          )}
          <div
            className={styles.sheetList}
            ref={scroller}
            role="region"
            aria-label={`${label} listings`}
            tabIndex={0}
          >
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
            {directorySections ? (
              <>
                <section
                  className={styles.resultSection}
                  aria-label="In map"
                  id={`${sheetId}-mapped`}
                  hidden={collection !== 'mapped'}
                >
                  <h3>
                    In map <span>{inMapItems.length}</span>
                  </h3>
                  <p className={styles.resultSectionCopy}>
                    Businesses in the visible map area. ZIP-area locations are
                    approximate.
                  </p>
                  {inMapItems.map(resultCard)}
                  {!loading && !failed && inMapItems.length === 0 && (
                    <p className={styles.resultSectionCopy}>
                      No matches in this map area. Move or zoom out on the map
                      to see more.
                    </p>
                  )}
                </section>
                <section
                  className={styles.resultSection}
                  aria-label="Online"
                  id={`${sheetId}-online`}
                  hidden={collection !== 'online'}
                >
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
              <>
                {unpinned > 0 && (
                  <p className={styles.resultSectionCopy}>
                    {unpinned} without map coordinates, included below
                  </p>
                )}
                {items.map(resultCard)}
              </>
            )}
            {!directorySections && footer}
          </div>
        </div>
      </section>
      <p className="sr-only" aria-live="polite">
        {preview && selected ? `Selected ${selected.title}` : ''}
      </p>
    </div>
  );
}
