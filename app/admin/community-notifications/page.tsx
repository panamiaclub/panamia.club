import { AdminPageHeader } from '@/components/Admin/parts';
import { CommunityNotifications } from '@/components/Admin/community-notifications';
import { requireAdmin } from '@/lib/admin/gate';
import {
  listAudienceSummaries,
  listCampaignHistory,
} from '@/lib/admin/community-notifications';
import { GhlClient } from '@/lib/ghl';

export const metadata = {
  title: 'Community notifications | Pana Admin',
  robots: { index: false, follow: false },
};

export default async function CommunityNotificationsPage() {
  await requireAdmin('/admin/community-notifications');
  const [audiences, campaigns] = await Promise.all([
    listAudienceSummaries(),
    listCampaignHistory(),
  ]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Community notifications"
        description="Reach a specific group of panas by text without building the audience again in HighLevel. The platform decides who belongs; HighLevel handles delivery."
      />
      <CommunityNotifications
        mode="live"
        initialAudiences={audiences}
        initialCampaigns={campaigns}
        highLevelConfigured={GhlClient.create() !== null}
      />
    </>
  );
}
