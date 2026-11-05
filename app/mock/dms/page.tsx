import type { Metadata } from 'next';
import { SURFACES, hostnameFor } from '@/lib/panaverse/surfaces';
import { DmsMock } from './_components/dms-mock';
import type { MockSurface } from '../_data/panaverse';

/* Design mock for Pana Social direct messages - two competing models on one
   route, switched from the mock toolbar.
 *
   Pana Social has no DM feature today, but it is not starting from zero: a DM
   is already expressible as a `socialStatuses` row with `visibility: 'direct'`
   and the recipient in `recipientTo`, and there are two API routes.
   What does not exist is any conversation
   UI, any threading, and any gating.

   So the open question is which shape that substrate grows into - async mail
   on the existing schema, or realtime chat on the Durable Object path already
   sketched in docs/CHAT-ROADMAP.md, whose own first open question is this
   exact decision. Both are rendered from one fixture set so the difference on
   screen is a difference in design rather than in the writing.

   Surfaces come from the same registry the Worker routes hostnames on, so the
   masthead cannot fly a mark for a surface that does not exist, and reading it
   server-side keeps `process.env` out of the client bundle.

   Noindex because it is a fixture route, not a real inbox. */
export const metadata: Metadata = {
  title: 'Messages (mock) | Pana Social',
  robots: { index: false, follow: false },
};

export default function MockDmsPage() {
  const surfaces: MockSurface[] = SURFACES.map((surface) => ({
    id: surface.id,
    name: surface.name,
    hostname: hostnameFor(surface),
    rootPath: surface.rootPath,
  }));

  return <DmsMock surfaces={surfaces} />;
}
