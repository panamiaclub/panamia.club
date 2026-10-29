import type { Metadata } from 'next';
import { DmChatMock } from './_components/dm-chat-mock';

/** Interactive layout study only; no sessions, sockets, or messaging APIs. */
export const metadata: Metadata = {
  title: 'Messages workspace (mock) | Pana Social',
  description:
    'An interactive, browser-only preview of the Messages workspace.',
  robots: { index: false, follow: false },
};

export default function MockDmChatPage() {
  return <DmChatMock />;
}
