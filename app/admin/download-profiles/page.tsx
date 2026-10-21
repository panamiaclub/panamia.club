'use client';

import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import PageMeta from '@/components/PageMeta';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAdminActiveProfiles,
  AdminProfileInterface,
} from '@/lib/query/admin';
import { Download } from 'lucide-react';

export default function AdminDownloadProfilesPage() {
  const { gate } = useAdminGate();
  const { data, isLoading, isError } = useAdminActiveProfiles();

  const downloadCSV = (data: AdminProfileInterface[]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Name,Email,Phone,Handle\n' +
      data
        .map(
          (profile: AdminProfileInterface) =>
            `"${profile.name}","${profile.email}","${profile.phone}","${profile.handle}"`
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'allProfiles.csv');
    document.body.appendChild(link);
    link.click();
  };

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Download Profiles | Admin" desc="" />
      <div>
        <AdminPageHeader
          eyebrow="Data"
          title="Download profiles"
          description={
            <p>
              Export the current active profile roster for approved operational
              use.
            </p>
          }
        />
        <Card>
          <CardHeader>
            <CardTitle>All Active Profiles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && <p>Loading profiles...</p>}
            {isError && (
              <p className="text-destructive">Error loading profiles</p>
            )}
            {data && (
              <Button onClick={() => downloadCSV(data)}>
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
