import { HOUSES } from '@/lib/connectors/model';

/**
 * The four houses, as a band on the Connectors front page.
 *
 * This is the `interlude` slot of `OfferingFrontPage` rather than one more
 * locale-driven band, because four does not fit a shape that counts to three
 * and because each house carries a colour that belongs to the programme model,
 * not to a translation file.
 *
 * Colours are applied as inline custom properties rather than as Tailwind
 * classes. `bg-${house.color}` cannot work — Tailwind only emits utilities it
 * can see as complete strings at build time, so a template literal produces a
 * class that exists nowhere in the stylesheet and the card renders colourless.
 * Writing the var through `style` is the supported escape hatch for a palette
 * that is data.
 *
 * The casting call is set larger than the description on purpose. "For the
 * extroverts, the yappers" is what makes somebody recognise themselves; the
 * paragraph underneath only matters once they already have.
 */
export function HouseBoard() {
  return (
    <section className="home-section offering-houses">
      <div className="container mx-auto px-4">
        <div className="home-sectionhead" data-rv>
          <h2 className="section-display">
            Four <em className="display-accent">Houses</em>
          </h2>
          <p className="section-lede mt-4 max-w-2xl">
            Houses group connectors by what they already like doing, not by what
            needs covering. Choose a major house for your primary focus and a
            different minor house for your secondary focus. Both are required;
            you can still help across all four.
          </p>
        </div>

        <ul
          className="mt-10 grid gap-5 sm:grid-cols-2"
          data-rv
          aria-label="The four connector houses"
        >
          {HOUSES.map((house) => (
            <li
              key={house.id}
              className="border-pana-ink bg-pana-cream flex flex-col overflow-hidden rounded-2xl border-2"
            >
              <div
                className="px-6 py-4"
                style={{
                  backgroundColor: `var(--color-${house.color})`,
                  color: `var(--color-${house.onColor})`,
                }}
              >
                <h3 className="text-xl leading-tight font-extrabold">
                  {house.name}
                </h3>
              </div>

              <div className="text-pana-ink flex flex-1 flex-col gap-3 px-6 py-5">
                <p className="text-base leading-snug font-bold">
                  {house.calling}
                </p>
                <p className="text-sm leading-relaxed opacity-80">
                  {house.blurb}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
