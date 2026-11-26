'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { DirectoryDashboard } from '@/components/Admin/directory-dashboard';
import type { DirectoryBusiness, DirectoryRoster } from '@/lib/admin/directory';

export function AdminDirectoryDashboard({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [roster, setRoster] = useState<DirectoryRoster>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const { data } = await axios.get<DirectoryRoster>(
        '/api/admin/directory',
        { signal }
      );
      if (
        !Array.isArray(data.businesses) ||
        !Number.isFinite(Date.parse(data.asOf))
      ) {
        throw new Error('Invalid directory roster response.');
      }
      setRoster(data);
    } catch (error) {
      if (axios.isCancel(error)) return;
      setLoadError('Could not load directory businesses. Please try again.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  async function changeStatus(business: DirectoryBusiness) {
    setBusyId(business.id);
    setActionError(undefined);
    setNotice('');
    try {
      await axios.post(
        `/api/admin/directory/${encodeURIComponent(business.id)}/status`,
        {
          active: !business.active,
          expectedActive: business.active,
        }
      );
      setRoster(
        (current) =>
          current && {
            ...current,
            businesses: current.businesses.map((row) =>
              row.id === business.id
                ? { ...row, active: !business.active }
                : row
            ),
          }
      );
      setNotice(
        `${business.name} ${business.active ? 'deactivated' : 'reactivated'}. ${business.active ? 'The profile is now hidden from' : 'The profile is now visible in'} the public directory.`
      );
    } catch (error) {
      setActionError(
        axios.isAxiosError<{ error?: string }>(error) &&
          error.response?.data.error
          ? error.response.data.error
          : 'Could not change profile visibility. Please try again.'
      );
      // Re-read after any failed write, including a lost response after commit.
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setActionError(undefined);
    setNotice('');
    try {
      const response = await fetch('/api/admin/directory/export', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? 'Your staff access could not be verified. Reload and sign in again.'
            : 'Could not export directory businesses. Please try again.'
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers
          .get('Content-Disposition')
          ?.match(/filename="([^"]+)"/)?.[1] ?? 'directory-businesses.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        'Business CSV downloaded, including active and inactive profiles.'
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Could not export directory businesses. Please try again.'
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <DirectoryDashboard
      businesses={roster?.businesses ?? []}
      asOf={roster?.asOf ?? new Date().toISOString()}
      loading={loading}
      loadError={loadError}
      actionError={actionError}
      busyId={busyId}
      exporting={exporting}
      notice={notice}
      onStatusChange={(business) => {
        void changeStatus(business);
      }}
      onExport={() => {
        void exportCsv();
      }}
      onReload={() => {
        void load();
      }}
    />
  );
}
