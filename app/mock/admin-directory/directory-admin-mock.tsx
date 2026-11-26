'use client';

import { useState } from 'react';
import { DirectoryDashboard } from '@/components/Admin/directory-dashboard';
import {
  BUSINESSES,
  SNAPSHOT_DATE,
  SNAPSHOT_TIME,
  businessCsv,
  type Business,
} from './data';

export function DirectoryAdminMock() {
  const [businesses, setBusinesses] = useState<Business[]>(BUSINESSES);
  const [notice, setNotice] = useState('');
  return (
    <DirectoryDashboard
      businesses={businesses}
      asOf={SNAPSHOT_TIME}
      notice={notice}
      onReset={() => {
        setBusinesses(BUSINESSES);
        setNotice('Sample data and filters reset.');
      }}
      onStatusChange={(business) => {
        setBusinesses((rows) =>
          rows.map((row) =>
            row.id === business.id ? { ...row, active: !row.active } : row
          )
        );
        setNotice(
          `${business.name} ${business.active ? 'deactivated' : 'reactivated'} in this mock. No live profile was changed.`
        );
      }}
      onExport={() => {
        const url = URL.createObjectURL(
          new Blob(['\uFEFF', businessCsv(businesses)], {
            type: 'text/csv;charset=utf-8;',
          })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `directory-businesses-MOCK-${SNAPSHOT_DATE}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(
          `CSV downloaded with all ${businesses.length} sample businesses, including inactive profiles.`
        );
      }}
    />
  );
}
