/**
 * The Pana basemap — the directory map's own cartography.
 *
 * Every raster basemap we tried (OSM, CARTO, Stadia, Esri) is somebody else's
 * design: grey land, blue-grey water, Arial-ish labels baked into the PNG as
 * pixels. On a page built from cream and indigo that reads as a screenshot
 * pasted into the layout. A CSS filter got land halfway to cream but could
 * never fix the labels — they are pixels, not text — and could not move land
 * and water independently, because one filter applies to every pixel at once.
 *
 * Vector tiles remove that ceiling: the browser draws the map from geometry,
 * so the colours are ours and the labels are set in the site's own typefaces.
 * See lib/map-tiles.tsx for the raster history this replaces.
 *
 * Layer *structure* comes from @protomaps/basemaps, which tracks the tile
 * schema; we supply the palette and the fonts. Writing seventy-odd layers by
 * hand would mean re-auditing them on every schema bump.
 */
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

/** Where the tiles come from. Same-origin, so no bucket CORS policy is needed. */
export const TILE_URL = '/api/map/tiles/{z}/{x}/{y}.mvt';

/** Static glyphs under public/map/glyphs, generated from the site's fonts. */
export const GLYPH_URL = '/map/glyphs/{fontstack}/{range}.pbf';

/**
 * Sprite sheet for the icons the basemap layers reference — highway shields,
 * airports, park markers. Self-hosted under public/map/sprite for the same
 * reason the tiles and glyphs are: the map should not depend on a third-party
 * CDN staying up. Without it MapLibre drops every shield and logs a warning
 * per missing icon.
 *
 * Unlike `glyphs`, MapLibre rejects a root-relative `sprite` outright, so this
 * has to be resolved against the current origin at style-build time.
 */
const SPRITE_PATH = '/map/sprite/basemap';

export function spriteUrl(): string {
  if (typeof window === 'undefined') return SPRITE_PATH;
  return new URL(SPRITE_PATH, window.location.origin).toString();
}

/**
 * Attribution for the data, which is a licence term rather than a courtesy.
 * OpenStreetMap is ODbL: the credit travels with the tiles wherever they go.
 */
export const BASEMAP_ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>';

/** Body font, matching the site. Only the weights we ship glyphs for. */
const NUNITO = 'Nunito Regular';
const NUNITO_BOLD = 'Nunito Bold';
/** Display font, used for place names the way headings use it on the page. */
const MONTSERRAT = 'Montserrat SemiBold';

/**
 * The palette, kept in sync with the CSS custom properties in globals.css.
 *
 * Duplicated as hex rather than read from CSS because MapLibre paints into a
 * WebGL canvas: it never resolves a `var(--color-pana-cream)`, so the values
 * have to arrive as literals.
 */
const CREAM = '#fff7ec';
const INDIGO = '#303e8c';
const NAVY = '#181c3d';

/**
 * Pana's flavour: warm land, genuinely blue water, everything else muted so
 * the pins stay the loudest thing on the map.
 *
 * Water is the one colour that gets to stay saturated. This is a map of South
 * Florida — the coastline and the bay are most of what you are looking at, and
 * a map that lets them drift grey has thrown away its sense of place. Land sits
 * at the page's own cream so the map reads as part of the layout rather than a
 * window cut into it.
 */
export const PANA_FLAVOR: Flavor = {
  ...namedFlavor('light'),

  background: '#fdf4e6',
  earth: CREAM,

  // The bay, the Atlantic, the canals. Pale enough to sit under labels, blue
  // enough that nobody mistakes it for land.
  water: '#c7d7f0',

  // Greens pulled towards the butter in the palette, so the parks read as warm
  // rather than as a different map's foliage.
  park_a: '#e9efcd',
  park_b: '#e1e9bd',
  wood_a: '#dde7b7',
  wood_b: '#d4dfa9',
  scrub_a: '#e4ebc4',
  scrub_b: '#dde5b6',
  zoo: '#e9efcd',

  // Sand and beach matter here more than almost anywhere else in the country.
  sand: '#f8ecd5',
  beach: '#f8e7c6',

  pedestrian: '#f9f1e2',
  industrial: '#f3ebdd',
  school: '#f6ecdb',
  hospital: '#f8e8e0',
  military: '#efead9',
  buildings: '#f0e3cf',
  pier: '#f3e8d6',

  // Roads: white for the ones you follow, warm cream casings instead of grey,
  // so nothing on the map goes colder than the page it sits on.
  other: '#fffaf1',
  minor_service: '#fffaf1',
  minor_a: '#ffffff',
  minor_b: '#fffdf8',
  link: '#ffe9d2',
  major: '#ffffff',
  highway: '#fbdcbd',

  minor_service_casing: '#f0e5d2',
  minor_casing: '#ece0cb',
  link_casing: '#e8c49c',
  major_casing_early: '#e7dac4',
  major_casing_late: '#e7dac4',
  highway_casing_early: '#e3a978',
  highway_casing_late: '#e3a978',

  railway: '#d8cdb6',
  boundaries: '#b6a68a',

  // Labels in the site's ink, haloed in the site's cream.
  city_label: NAVY,
  city_label_halo: CREAM,
  state_label: '#6b7bb5',
  state_label_halo: CREAM,
  country_label: INDIGO,
  subplace_label: '#4a5590',
  subplace_label_halo: CREAM,
  roads_label_minor: '#8d8471',
  roads_label_minor_halo: CREAM,
  roads_label_major: '#6f6752',
  roads_label_major_halo: CREAM,
  ocean_label: '#7a8fc4',
  address_label: '#9c937f',
  address_label_halo: CREAM,

  regular: NUNITO,
  bold: NUNITO_BOLD,
  // No italic glyphs are generated, so italic points at the regular face. A
  // missing fontstack is a 404 per label range, not a graceful fallback.
  italic: NUNITO,
};

/**
 * Label layers that get the display face, as headings do on the page.
 *
 * Deliberately not `places_subplace`: neighbourhood names are dense and small,
 * and a display face at that size is where legibility goes.
 */
const DISPLAY_LABEL_LAYERS = new Set([
  'places_locality',
  'places_region',
  'places_country',
]);

/**
 * The style document MapLibre renders.
 *
 * `maxzoom: 15` is the archive's own limit, not a cap on how far the viewer can
 * zoom — MapLibre keeps scaling the z15 geometry past it, which is why vector
 * tiles stay sharp where raster tiles turn to mush.
 */
export function panaMapStyle(): StyleSpecification {
  const styled = layers('protomaps', PANA_FLAVOR, { lang: 'en' }).map(
    (layer) => {
      if (layer.type !== 'symbol' || !DISPLAY_LABEL_LAYERS.has(layer.id)) {
        return layer;
      }
      // Place names carry the brand hardest, so they get Montserrat the way an
      // h1 does. Everything else stays Nunito: a map set entirely in a display
      // face stops being legible at street-label sizes.
      return {
        ...layer,
        layout: { ...layer.layout, 'text-font': [MONTSERRAT] },
      };
    }
  );

  return {
    version: 8,
    glyphs: GLYPH_URL,
    sprite: spriteUrl(),
    sources: {
      protomaps: {
        type: 'vector',
        tiles: [TILE_URL],
        maxzoom: 15,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: styled,
  };
}
