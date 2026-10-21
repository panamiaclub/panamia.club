import type { Metadata } from 'next';

import { CommunityNotifications } from '@/components/Admin/community-notifications';
import { AdminPageHeader } from '@/components/Admin/parts';

export const metadata: Metadata = {
  title: 'Community notifications (mock) | Pana Admin',
  robots: { index: false, follow: false },
};

export default function MockCommunityNotificationsPage() {
  return (
    <main className="bg-pana-cream text-pana-ink min-h-screen">
      <div className="container mx-auto px-4 py-8 lg:py-10">
        <div className="border-pana-ink/25 bg-pana-butter-2 mb-6 rounded-xl border-2 border-dashed px-4 py-3 text-sm">
          <span className="font-black">Review-only mock.</span>{' '}
          <span className="text-pana-ink/65">
            This public preview uses fixture data and cannot send messages.
          </span>
        </div>
        <AdminPageHeader
          eyebrow="Community"
          title="Community notifications"
          description="Reach a specific group of panas by text without building the audience again in HighLevel. The platform decides who belongs; HighLevel handles delivery."
        />
        <CommunityNotifications />
      </div>
    </main>
  );
}
