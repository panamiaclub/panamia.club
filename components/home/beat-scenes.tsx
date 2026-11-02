'use client';

import Image from 'next/image';
import type { BeatScene } from './content';

/**
 * The artwork for each stop on the band.
 *
 * Two kinds, one component each. Two stops are single photographs and share
 * `PhotoScene`; the local-future stop is the map, which is not the
 * same job — it arrives on scroll and carries its own caption — so it keeps
 * its own renderer. The union in `content.ts` is what keeps them
 * interchangeable at the call site.
 */
export function BeatSceneArt({ scene }: { scene: BeatScene }) {
  switch (scene.kind) {
    case 'photo':
      return <PhotoScene scene={scene} />;
    case 'map':
      return <MapScene scene={scene} />;
  }
}

/* -------------------------------------------------------------------------
   Photos - the community and founders
   ------------------------------------------------------------------------- */

/**
 * One photograph, edge to edge.
 *
 * This replaced three separate scenes: a fanned collage of four prints, a row
 * of five round portraits, and a drawn banner with the vision written on it.
 * All three were compositions, and what was wanted here was a picture. A
 * single frame of a real room also says "these are panas" faster than an
 * arrangement of smaller ones does, because there is nothing to read first.
 *
 * `fill` rather than intrinsic dimensions: the card is a fixed-height window
 * whose width changes with the column, so there is no aspect ratio to hold
 * and the crop has to follow the box. The wrapper is what rounds and clips
 * it - `border-radius` on the image alone leaves square corners behind
 * whenever the browser paints the background of the replaced element.
 */
function PhotoScene({
  scene,
}: {
  scene: Extract<BeatScene, { kind: 'photo' }>;
}) {
  return (
    <div className="beat-photo">
      <Image
        src={scene.src}
        alt={scene.alt}
        fill
        sizes="(max-width: 959px) 86vw, 32vw"
        className="beat-photo-img"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
   Map - the local future
   ------------------------------------------------------------------------- */

/**
 * Florida, rising.
 *
 * The map comes up into place as the section scrolls in, which is the one
 * piece of motion on the page that is doing an argument rather than a
 * flourish: the answer to "why local" is that this is a real, bounded place
 * with three counties in it, and having the state physically arrive makes
 * that point before the paragraph next to it does.
 *
 * It sits straight on the card now. The bordered, shadowed panel it used to
 * have read as a picture inside a picture, so the wrapper keeps nothing but
 * `overflow: hidden` - which is still load-bearing, because it is what the
 * rise is clipped against.
 *
 * The counties are listed under it south-first, the way the site orders them
 * everywhere else.
 */
function MapScene({ scene }: { scene: Extract<BeatScene, { kind: 'map' }> }) {
  return (
    <figure className="statemap">
      <div className="statemap-clip">
        <Image
          src={scene.src}
          alt={scene.alt}
          width={800}
          height={600}
          className="statemap-img"
          sizes="(max-width: 768px) 70vw, 30vw"
        />
      </div>
      {scene.counties.length > 0 && (
        <figcaption className="statemap-counties">
          {scene.counties.map((county) => (
            <span key={county} className="statemap-county">
              {county}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
