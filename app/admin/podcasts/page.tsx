'use client';

import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import PageMeta from '@/components/PageMeta';
import { Card, CardContent } from '@/components/ui/card';

export default function AdminPodcastsPage() {
  const { gate } = useAdminGate();

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Podcast Setup | Admin" desc="" />
      <div>
        <AdminPageHeader
          eyebrow="Publishing"
          title="Podcast setup"
          description={
            <p>Configure how podcast content is presented across Pana MIA.</p>
          }
        />
        <Card>
          <CardContent className="p-6">
            {/* Placeholder for future podcast setup functionality */}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
