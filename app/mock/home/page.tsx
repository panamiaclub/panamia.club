import type { Metadata } from 'next';
import { HomeMock } from './_components/home-mock';

/* Design mock for the homepage.
 *
 * Route: /mock/home
 *
 * Uses the shared homepage sections, including the approved three collapsed
 * welcome cards. Copy lives in the home locale and styling in app/globals.css;
 * only the review toolbar and density control differ from the live homepage.
 *
 * Noindex because it is a fixture route. It duplicates the real homepage's
 * subject matter almost exactly, so left indexable it would compete with `/`
 * for the site's own name.
 */
export const metadata: Metadata = {
  title: 'Homepage (mock) | Pana Mia',
  robots: { index: false, follow: false },
};

export default function MockHomePage() {
  return <HomeMock />;
}
