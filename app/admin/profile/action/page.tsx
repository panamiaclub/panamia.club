'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AdminPageHeader } from '@/components/Admin/parts';

function ProfileActionContent() {
  const searchParams = useSearchParams();
  const [actionResponse, setActionResponse] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [totalProfiles, setTotalProfiles] = useState(0);

  useEffect(() => {
    if (!searchParams) return;

    const email = searchParams.get('email');
    const profileId = searchParams.get('profileId');
    const accessKey = searchParams.get('access');
    const action = searchParams.get('action');

    // Only proceed if we have the required query parameters
    if (action === 'approve' || action === 'decline') {
      axios
        .post(
          '/api/admin/profile/action',
          { profileId, email, access: accessKey, action },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }
        )
        .then((response) => {
          if (response?.data?.success) {
            const data = response.data.data[0];
            setActionResponse(data.message);
            setProfileUrl(`/p/${data.handle}`);
            setProfileName(data.name);
            setTotalProfiles(data.total);
          } else {
            setActionResponse(response.data.error);
          }
        })
        .catch((error) => {
          console.error('Error processing profile action:', error);
          setActionResponse('An error occurred processing this action');
        });
    }
  }, [searchParams]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Directory"
        title="Profile decision"
        description={
          <p>The result of the approval or decline link that was opened.</p>
        }
      />
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <p>
            <strong>Profile:</strong> {profileName}
          </p>
          <p>
            <strong>Status:</strong> {actionResponse}
          </p>
          {profileUrl && (
            <Button asChild>
              <Link href={profileUrl}>View Profile</Link>
            </Button>
          )}
          <p>
            <small>
              Active Profiles:{' '}
              {totalProfiles > 0 ? totalProfiles : 'calculating...'}
            </small>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminProfileActionPage() {
  return (
    <Suspense
      fallback={
        <div>
          <AdminPageHeader
            eyebrow="Directory"
            title="Profile decision"
            description={<p>Processing the requested action…</p>}
          />
          <Card>
            <CardContent className="p-6 text-center">Loading...</CardContent>
          </Card>
        </div>
      }
    >
      <ProfileActionContent />
    </Suspense>
  );
}
