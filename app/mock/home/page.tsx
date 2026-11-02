import type { Metadata } from 'next';
import { HomeMock } from './_components/home-mock';

/* Design mock for the homepage.
 *
 * Route: /mock/home
 *
 * Uses the shared homepage sections with a mock-only Welcome Pana card
 * proposal. Its copy is under `mock.welcomeCards` in the home locale, and its
 * layout is scoped in `_components/welcome-cards.module.css`. The live
 * homepage keeps its existing default cards until the proposal is approved.
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
