import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  DEFAULT_CENTER,
  FALLBACK_MAP_PX,
  VIEWER_RADIUS_MILES,
  frameForPoints,
  onResultsArrived,
  viewerFrame,
  zoomForRadius,
} from '../app/directory/search/_lib/map-frame';

/**
 * The directory map's framing maths.
 *
 * Asserted in miles rather than in zoom levels. A zoom number is not something
 * anyone can eyeball for correctness — "11.4" looks as plausible as "9.4" —
 * so a test that pinned the zoom would lock in whatever the code happened to
 * do, including a mistake. Converting back to miles tests the thing that was
 * actually asked for.
 */

/**
 * Metres per pixel in Web Mercator, from the canonical constant.
 *
 * Deliberately not derived from map-frame's own circumference: this is the
 * published figure for zoom 0 at the equator with 256px tiles, so agreeing
 * with it is independent evidence rather than the implementation restating
 * itself.
 */
const metresPerPixel = (lat: number, zoom: number) =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

const METRES_PER_MILE = 1609.344;

/** How many miles of ground a map of `sizePx` shows at this zoom. */
const milesAcross = (lat: number, zoom: number, sizePx: number) =>
  (metresPerPixel(lat, zoom) * sizePx) / METRES_PER_MILE;

/** Miami, where most of the directory is. */
const MIAMI = { lat: 25.7617, lng: -80.1918 };

describe('zoomForRadius', () => {
  it('frames twice the radius across the map', () => {
    const zoom = zoomForRadius(MIAMI.lat, 5, 600);
    // A 5-mile radius means 5 miles in each direction from the centre.
    assert.ok(
      Math.abs(milesAcross(MIAMI.lat, zoom, 600) - 10) < 0.05,
      `expected ~10 miles across, got ${milesAcross(MIAMI.lat, zoom, 600)}`
    );
  });

  it('holds the radius steady across pane sizes', () => {
    // The same frame on a phone panel and on half a desktop split. A hardcoded
    // zoom would pass the test above and fail this one, showing a phone user
    // barely two miles.
    for (const sizePx of [320, 480, 560, 720, 1040]) {
      const zoom = zoomForRadius(MIAMI.lat, 5, sizePx);
      const across = milesAcross(MIAMI.lat, zoom, sizePx);
      assert.ok(
        Math.abs(across - 10) < 0.05,
        `at ${sizePx}px expected ~10 miles across, got ${across}`
      );
    }
  });

  it('corrects for latitude', () => {
    // A Mercator map shows less ground per pixel the further it is from the
    // equator, so covering the same five miles up north means pulling *back*,
    // not pushing in. Without the cosine these would be equal.
    const miami = zoomForRadius(25.7617, 5, 600);
    const anchorage = zoomForRadius(61.2181, 5, 600);
    assert.ok(
      anchorage < miami,
      `expected a wider zoom further north, got ${anchorage} vs ${miami}`
    );
    assert.ok(Math.abs(milesAcross(61.2181, anchorage, 600) - 10) < 0.05);
  });

  it('stays within the levels the tiles and the data support', () => {
    // A metre-wide radius would otherwise ask for a zoom no tile server has,
    // and a geocoded street address does not justify that precision anyway.
    assert.ok(zoomForRadius(MIAMI.lat, 0.001, 600) <= 15);
    assert.ok(zoomForRadius(MIAMI.lat, 5000, 600) >= 8);
  });
});

describe('viewerFrame', () => {
  it('centres on the viewer', () => {
    const frame = viewerFrame(MIAMI, 600);
    assert.deepEqual(frame.center, [MIAMI.lat, MIAMI.lng]);
  });

  it('shows the agreed radius around them', () => {
    const frame = viewerFrame(MIAMI, 600);
    const across = milesAcross(MIAMI.lat, frame.zoom, 600);
    assert.ok(
      Math.abs(across - VIEWER_RADIUS_MILES * 2) < 0.05,
      `expected ~${VIEWER_RADIUS_MILES * 2} miles across, got ${across}`
    );
  });

  it('frames each selectable radius', () => {
    for (const radius of [5, 10, 25, 50]) {
      const frame = viewerFrame(MIAMI, 600, radius);
      const across = milesAcross(MIAMI.lat, frame.zoom, 600);
      assert.ok(
        Math.abs(across - radius * 2) < 0.05,
        `expected ~${radius * 2} miles across, got ${across}`
      );
    }
  });

  it('is a five-mile radius', () => {
    // Pinned on purpose. This is a product decision, not an implementation
    // detail, so changing it should be a deliberate edit to this line.
    assert.equal(VIEWER_RADIUS_MILES, 5);
  });

  it('still shows about the right radius when the pane cannot be measured', () => {
    // Hidden behind the List/Map toggle, the pane has no box to measure. The
    // fallback only has to serve a phone — above the toggle's breakpoint the
    // pane is always laid out — so it is checked against a real phone pane
    // (343px on a 390px viewport). A desktop-sized fallback passes a loose
    // range check and still leaves a phone showing three miles, not five.
    const PHONE_PANE_PX = 343;
    const frame = viewerFrame(MIAMI, FALLBACK_MAP_PX);
    const across = milesAcross(MIAMI.lat, frame.zoom, PHONE_PANE_PX);
    assert.ok(
      Math.abs(across - VIEWER_RADIUS_MILES * 2) < 1,
      `expected ~${VIEWER_RADIUS_MILES * 2} miles across a phone pane, got ${across}`
    );
  });
});

describe('frameForPoints', () => {
  it('falls back to the covered region when there is nothing to show', () => {
    const frame = frameForPoints([]);
    assert.deepEqual(frame.center, DEFAULT_CENTER);
  });

  it('centres between the points', () => {
    const frame = frameForPoints([
      { lat: 25.0, lng: -80.0 },
      { lat: 26.0, lng: -81.0 },
    ]);
    assert.deepEqual(frame.center, [25.5, -80.5]);
  });

  it('pulls back further for a wider spread', () => {
    const tight = frameForPoints([
      { lat: 25.76, lng: -80.19 },
      { lat: 25.79, lng: -80.22 },
    ]);
    const wide = frameForPoints([
      { lat: 25.0, lng: -80.0 },
      { lat: 26.9, lng: -80.3 },
    ]);
    assert.ok(
      wide.zoom < tight.zoom,
      `expected the wider spread to zoom out, got ${wide.zoom} vs ${tight.zoom}`
    );
  });

  it('does not slam to street level for a single point', () => {
    // One marker at maximum zoom on an otherwise empty tile says nothing about
    // where it is.
    const frame = frameForPoints([MIAMI]);
    assert.equal(frame.zoom, 13);
  });
});

/**
 * Who wins when a location and a result set both want the map.
 *
 * Replayed as sequences rather than asserted a call at a time, because the
 * bug this guards against is an ordering one: sharing a location changes the
 * search's cache key, so the results blank out and refill, and the map is
 * told about the empty set *before* the real one.
 */
describe('onResultsArrived', () => {
  /** Mirrors the component: what the map is framed on after each event. */
  function mapFrame() {
    let pending = false;
    let showing: 'results' | 'viewer' = 'results';
    return {
      /** A result set reached the map. */
      results(pinCount: number) {
        const decision = onResultsArrived(pending, pinCount);
        pending = decision.viewerFramePending;
        if (decision.reframe) showing = 'results';
      },
      /** The viewer's location became known. */
      locationShared() {
        pending = true;
        showing = 'viewer';
      },
      get showing() {
        return showing;
      },
    };
  }

  it('keeps the viewer framed when they press the button', () => {
    const map = mapFrame();
    map.results(12); // the directory as first loaded
    map.locationShared();
    map.results(0); // the search re-runs with the coordinates attached
    map.results(12); // and comes back
    assert.equal(map.showing, 'viewer');
  });

  it('keeps the viewer framed on a return visit', () => {
    const map = mapFrame();
    map.results(0); // nothing fetched yet
    map.locationShared(); // coordinates come back from storage first
    map.results(12); // then the network answers
    assert.equal(map.showing, 'viewer');
  });

  it('hands the map back once the viewer searches for something', () => {
    const map = mapFrame();
    map.locationShared();
    map.results(0);
    map.results(12); // the results that the location outranks
    map.results(0); // a search of their own
    map.results(4);
    assert.equal(map.showing, 'results');
  });

  it('frames the results when no location was ever shared', () => {
    const map = mapFrame();
    map.results(0);
    map.results(12);
    assert.equal(map.showing, 'results');
  });

  it('holds the viewer rather than falling back to the whole region', () => {
    // Their location is the only thing worth showing on an empty search, and
    // it is better than the region-wide default they just came out of.
    const map = mapFrame();
    map.locationShared();
    map.results(0);
    assert.equal(map.showing, 'viewer');
  });
});
