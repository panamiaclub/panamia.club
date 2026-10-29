import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import AboutUsContent from '../AboutUsContent';

const SECTIONS = new Set([
  'our-story',
  'why-local',
  'pillars',
  'meet-the-team',
  'collaborative-projects',
]);

export const metadata: Metadata = {
  alternates: { canonical: '/about-us' },
};

export default async function AboutUsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!SECTIONS.has(section)) notFound();

  return <AboutUsContent section={section} />;
}
