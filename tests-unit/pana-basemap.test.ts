import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  BASEMAP_ATTRIBUTION,
  GLYPH_URL,
  PANA_FLAVOR,
  TILE_URL,
  panaMapStyle,
} from '../lib/map/pana-basemap';

/**
 * The basemap style document.
 *
 * The map is rendered by MapLibre from this object, so most of its appearance
 * is data rather than code — and data that is wrong fails quietly. A missing
 * `sprite` does not throw; it drops every highway shield and logs a warning
 * nobody reads. A font name that no glyph directory matches does not throw
 * either; the labels simply vanish. These assertions cover the handful of
 * fields whose breakage is invisible in a screenshot but fatal on the page.
 */
describe('panaMapStyle', () => {
  const style = panaMapStyle();

  it('points at our own tiles, glyphs and sprite', () => {
    // All three are same-origin on purpose: the point of hosting the basemap
    // ourselves is that it cannot be taken down by someone else's CDN.
    assert.equal(style.glyphs, GLYPH_URL);
    assert.ok(style.sprite, 'style must declare a sprite');
    assert.ok(
      !/^https?:\/\/(?!localhost|127\.0\.0\.1)/.test(String(style.sprite)),
      `sprite must not be third-party, got ${style.sprite}`
    );

    const source = style.sources.protomaps;
    assert.equal(source.type, 'vector');
    assert.deepEqual(source.type === 'vector' ? source.tiles : null, [
      TILE_URL,
    ]);
  });

  it('stops at the zoom the archive actually contains', () => {
    // Past this MapLibre overzooms the z15 geometry, which stays sharp. Asking
    // for a tile the archive does not hold would just 404 on every pan.
    const source = style.sources.protomaps;
    assert.equal(source.type === 'vector' ? source.maxzoom : null, 15);
  });

  it('keeps the ODbL attribution, which is a licence term', () => {
    const source = style.sources.protomaps;
    const attribution =
      source.type === 'vector' ? String(source.attribution) : '';
    assert.equal(attribution, BASEMAP_ATTRIBUTION);
    assert.match(attribution, /OpenStreetMap/);
  });

  it('only asks for fonts we ship glyphs for', () => {
    // MapLibre resolves `text-font` against the glyph directories by exact
    // name. A weight we never generated renders as no label at all.
    const shipped = new Set([
      'Nunito Regular',
      'Nunito Bold',
      'Montserrat SemiBold',
    ]);

    const requested = new Set<string>();
    for (const layer of style.layers) {
      if (layer.type !== 'symbol') continue;
      const font = layer.layout?.['text-font'];
      if (Array.isArray(font)) {
        for (const name of font) {
          if (typeof name === 'string') requested.add(name);
        }
      }
    }

    assert.ok(requested.size > 0, 'expected some labelled layers');
    for (const name of requested) {
      assert.ok(shipped.has(name), `no glyphs shipped for "${name}"`);
    }
  });

  it('sets place names in the display face', () => {
    // The brand lives in the place names; everything else stays Nunito so the
    // map is still legible at street-label sizes.
    const locality = style.layers.find((l) => l.id === 'places_locality');
    assert.ok(locality, 'expected a places_locality layer');
    assert.deepEqual(
      locality.type === 'symbol' ? locality.layout?.['text-font'] : null,
      ['Montserrat SemiBold']
    );
  });

  it('paints bridged ramps the same colour as the ramps they continue', () => {
    // Upstream paints `roads_bridges_link` from `bridges_minor`, so without a
    // correction a ramp switches colour every time it crosses a bridge. That
    // is most of the geometry at a big interchange.
    const colorOf = (id: string) => {
      const layer = style.layers.find((l) => l.id === id);
      assert.ok(layer, `expected a ${id} layer`);
      return layer.type === 'line' ? layer.paint?.['line-color'] : null;
    };

    assert.equal(colorOf('roads_bridges_link'), colorOf('roads_link'));
    assert.equal(colorOf('roads_bridges_highway'), colorOf('roads_highway'));
    assert.equal(colorOf('roads_bridges_major'), colorOf('roads_major'));
  });
});

/**
 * The palette itself.
 *
 * `PANA_FLAVOR` spreads `namedFlavor('light')` and overrides from there, which
 * means every key we forget silently inherits a stock grey instead of failing.
 * That is not hypothetical: bridges and tunnels are separate layers from the
 * roads they continue, so an un-overridden `bridges_highway` rendered I-95 in
 * `#ffffff` with an `#e0e0e0` casing — the road changed colour mid-span every
 * time it crossed a bridge, and nothing anywhere reported an error.
 *
 * So rather than assert specific hex values, which only restates the source,
 * this asserts the rule the palette exists to enforce: nothing on the map goes
 * colder than the page it sits on.
 */
describe('PANA_FLAVOR', () => {
  /**
   * Colours that are meant to be cool: the water, and the label inks that sit
   * on top of it. Everything else is warm by design.
   */
  const COOL_BY_DESIGN = new Set([
    'water',
    'city_label',
    'state_label',
    'country_label',
    'subplace_label',
    'ocean_label',
  ]);

  /** Accepts both `#rrggbb` and the `rgba(…)` form the landcover keys use. */
  const parseColor = (value: string): [number, number, number] | null => {
    const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
    if (hex) {
      const n = parseInt(hex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value.trim());
    if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
    return null;
  };

  it('leaves no stock grey un-overridden', () => {
    const offenders: string[] = [];

    const check = (key: string, value: string) => {
      if (COOL_BY_DESIGN.has(key)) return;
      const rgb = parseColor(value);
      if (!rgb) return;
      const [r, g, b] = rgb;
      // Pure white is a legitimate road fill. Anything else whose red channel
      // does not lead is either a neutral grey or actively cool.
      if (r === 255 && g === 255 && b === 255) return;
      if (r > b) return;
      offenders.push(`${key}: ${value}`);
    };

    for (const [key, value] of Object.entries(PANA_FLAVOR)) {
      if (typeof value === 'string') check(key, value);
    }
    // Landcover paints the whole metro area at low zoom, so it counts.
    for (const [key, value] of Object.entries(PANA_FLAVOR.landcover ?? {})) {
      if (typeof value === 'string') check(`landcover.${key}`, value);
    }

    assert.deepEqual(
      offenders,
      [],
      `these keys still carry a stock grey or cool default:\n  ${offenders.join('\n  ')}`
    );
  });

  it('carries every bridge and tunnel road over from its surface colour', () => {
    // The specific failure that prompted the rule above. A bridge is a
    // separate layer from the road it continues, so if it is not painted the
    // same colour the road visibly changes shade mid-span at every overpass.
    // `#ffffff` passes the warmth rule above but is still wrong for a highway,
    // which is why this asserts equality rather than warmth.
    const surfaceOf: Record<string, string> = {
      other: 'other',
      minor: 'minor_a',
      link: 'link',
      major: 'major',
      highway: 'highway',
    };

    const flavor = PANA_FLAVOR as unknown as Record<string, string>;

    for (const [kind, surfaceKey] of Object.entries(surfaceOf)) {
      assert.equal(
        flavor[`bridges_${kind}`],
        flavor[surfaceKey],
        `bridges_${kind} must match ${surfaceKey} or the road changes colour on the bridge`
      );
    }

    // Casings and tunnels are allowed to differ — a bridge casing is darker so
    // the span lifts, a tunnel is muted so it recedes — but neither may go
    // cool, which is how the stock greys got in.
    for (const kind of Object.keys(surfaceOf)) {
      for (const key of [
        `bridges_${kind}_casing`,
        `tunnel_${kind}`,
        `tunnel_${kind}_casing`,
      ]) {
        const value = flavor[key];
        assert.equal(typeof value, 'string', `${key} must be set`);
        const rgb = parseColor(value);
        assert.ok(rgb, `${key} must be a parseable colour`);
        const [r, , b] = rgb;
        assert.ok(
          r > b,
          `${key} is neutral or cool (${value}); it must stay warm`
        );
      }
    }
  });
});
