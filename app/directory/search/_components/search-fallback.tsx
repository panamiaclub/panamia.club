import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/**
 * Suspense fallback shared by every search route — /d, /directory/search and
 * /directory/search/<term> — so the three render an identical shell.
 *
 * This is a skeleton of the real page rather than a page of its own, and the
 * reason is sharper than "a nicer spinner". `DirectorySearchContent` is a
 * client component calling `useSearchParams()`, so the boundary around it
 * re-suspends *on hydration* — measured on a throttled connection, the real
 * directory paints, and then roughly four seconds later it is torn down and
 * replaced by this for ~300ms before coming back. A fallback is therefore not
 * a placeholder shown before anything exists; it is an interruption shown over
 * a page the visitor is already reading.
 *
 * That makes the old fallback — a centred headline over a short "Loading…"
 * card — about the worst possible shape. It was a different page, and being
 * ~600px shorter than the real one it dragged the site footer up into the
 * middle of the viewport and dropped it again. The footer moving was the most
 * visible part of the flash, more so than the content changing.
 *
 * Two things fix that, and both have to hold:
 *
 * - The root element reproduces the real page's layout container exactly:
 *   `.dirsearch.dirsearch-split` with `data-view="list"` and the same
 *   `.dirsearch-panes` beneath it. The directory cannot hoist its chrome
 *   outside the boundary the way /groups does — `SearchBand` lives inside the
 *   client component and depends on its search state — so the fallback has to
 *   bring the chrome with it. Wearing `.dirsearch-split` also means this
 *   inherits the same `body:has(.dirsearch-split)` viewport lock and the same
 *   `footer { display: none }` above the 72rem breakpoint, which is what
 *   makes the swap a no-op for layout there.
 * - `min-h-screen` as the floor, but only below that breakpoint, where the
 *   page scrolls normally and the real column's height depends on how many
 *   results came back. It is the cheap, reliable half of the guarantee:
 *   whatever else differs, the footer cannot ride up. It is deliberately NOT
 *   applied at desktop — there the body is already a definite `100svh` and
 *   this `<main>` is the flex child that takes whatever the masthead leaves,
 *   so forcing a full viewport onto it would overflow the body by the height
 *   of the masthead and put the window straight back into scrolling.
 *
 * Everything inside is static markup wearing the real page's class names, not
 * the real components. `SearchBand`, `FilterBar` and `MapPanel` are all
 * `'use client'`, and `MapPanel` pulls in pigeon-maps and starts fetching map
 * tiles — work thrown away milliseconds later by the swap. Nothing here is
 * interactive for the same reason: a search field a visitor can type into is a
 * field whose keystrokes vanish when Suspense resolves.
 *
 * Placeholders follow the house pattern from /groups — `animate-pulse` over
 * `bg-pana-ink/10` blocks sized like the content they stand in for, wrapped in
 * `aria-hidden` so none of it is announced. The one exception is the results
 * list, which uses `.dirsearch-skeleton`: that is the idiom the live page
 * already shows between searches, so the hand-off from this shell to the
 * page's own loading state has nothing to see.
 */
export function SearchFallback() {
  return (
    // `list` is what search-content renders with no `view` param, and below
    // the split's breakpoint that attribute decides which pane owns the
    // screen. Guessing `map` would show an empty map on a phone and then
    // replace it with the list.
    //
    // `dirsearch-split` is load-bearing beyond the layout: the stylesheet
    // hides the site footer with `body:has(.dirsearch-split) > footer` above
    // 72rem. Drop or rename this class and the footer un-hides for the
    // length of the swap and pops into the middle of the viewport, which is
    // the loudest part of the flash. The matching breakpoint is spelled
    // 71.999rem here for the same reason it is in globals.css.
    <main
      className="dirsearch dirsearch-split max-[71.999rem]:min-h-screen"
      data-view="list"
    >
      <section className="dirsearch-band">
        <div className="container mx-auto px-4">
          <span className="section-eyebrow">Directory</span>

          {/* A real heading, not a shimmer bar. This markup ships in the
              server HTML, so it is what a crawler and anyone landing on an
              assistive technology early have to go on. It is also the one
              line that does not change across the swap when no term has been
              searched, which is the common case on /d. */}
          <h1 className="dirsearch-title">Find your people</h1>

          <div className="animate-pulse" aria-hidden="true">
            {/* The count line. A bar rather than the word "Searching…",
                because the live page puts a `role="status"` here and a second
                voice saying the same thing from the fallback is noise. */}
            <div className="bg-pana-ink/10 mt-[0.6rem] h-4 w-64 rounded-full" />

            {/* The search pill. A block, not a disabled input: an input
                invites a click and a first keystroke, and both are lost the
                moment the real page mounts over this one. */}
            <div className="dirsearch-searchrow">
              <div className="bg-pana-ink/10 h-[3.4rem] w-full max-w-[720px] rounded-full" />
            </div>

            {/* The location bar. */}
            <div className="bg-pana-ink/10 mt-[0.95rem] h-4 w-72 rounded-full" />
          </div>
        </div>
      </section>

      <div className="dirsearch-panes">
        <section className="dirsearch-listpane" aria-label="Search results">
          <div className="dirsearch-listhead">
            <div className="dirsearch-filters">
              <div className="dirsearch-filterinner dirsearch-filterinner--menus">
                <div
                  className="dirsearch-menurow animate-pulse"
                  aria-hidden="true"
                >
                  {/* Category, Radius, certification, events and Sort, at
                      roughly the widths their real controls occupy. */}
                  {['w-28', 'w-28', 'w-36', 'w-32', 'w-20'].map(
                    (width, index) => (
                      <div
                        key={`${width}-${index}`}
                        className={`bg-pana-ink/10 h-[1.9rem] rounded-full ${width}`}
                      />
                    )
                  )}

                  {/* The List/Map toggle, which the real filter row hides
                      above the split's breakpoint and shows below it. Leaving
                      it out would shift the pills beside it on a phone. */}
                  <div className="bg-pana-ink/10 ml-auto h-[1.9rem] w-32 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="dirsearch-listscroll">
            <div className="dirsearch-listbody">
              <div className="dirsearch-results">
                <ul className="dirsearch-grid" aria-busy="true">
                  {[0, 1, 2].map((index) => (
                    <li key={index} className="dirsearch-skeleton" />
                  ))}
                </ul>
              </div>

              {/* The tail of the real column, carried verbatim rather than
                  shimmered. It is static content on the live page too, so
                  rendering the real thing means these blocks are identical
                  either side of the swap — nothing to flash at all. Above the
                  breakpoint it is below the fold and costs nothing; below it
                  the page scrolls, and ending the column early here is what
                  would let the footer move. */}
              <aside className="dirsearch-cta">
                <div>
                  <h2>Not listed yet?</h2>
                  <p>
                    A listing is how South Florida finds you — free, and yours
                    to run.
                  </p>
                  <Link href="/form/get-listed" className="link-arrow">
                    List your business
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
                <div>
                  <h2>Missing someone?</h2>
                  <p>
                    Tell us about a local spot you love and we will reach out to
                    them.
                  </p>
                  <Link href="/form/contact-us" className="link-arrow">
                    Send a recommendation
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </aside>

              <p className="dirsearch-photocredit">
                Listing photos from{' '}
                <a
                  href="https://www.pexels.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Pexels
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Empty on purpose. `.dirsearch-map` paints its own illustrative
            gradient and carries the pane's height, so the right-hand column
            holds its space without a single tile request. */}
        <aside className="dirsearch-mappane" aria-label="Results on a map">
          <div className="dirsearch-map" aria-hidden="true" />
        </aside>
      </div>
    </main>
  );
}
