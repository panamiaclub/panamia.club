import type { ReactNode } from 'react';

import AdminNav from '@/components/Admin/nav';

/**
 * Chrome for every staff tool.
 *
 * This wraps real pages as well as the two mocked ones, so it deliberately
 * carries nothing that makes a claim about the content: no "MOCK" banner, no
 * counts, no headings. `AdminMockBar` stays inside the two mocked pages that
 * have fixture data in them, because putting it here would stamp "every number
 * below is a fixture" across the live CSV export and the approval links that
 * arrive in staff email.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-pana-cream text-pana-ink min-h-screen">
      <div className="container mx-auto flex flex-col gap-7 px-4 py-7 lg:flex-row lg:gap-8 lg:py-10">
        <AdminNav />
        <main className="[&_.bg-card]:border-pana-ink/10 [&_input]:border-pana-ink/15 [&_select]:border-pana-ink/15 [&_textarea]:border-pana-ink/15 min-w-0 flex-1 [&_.bg-card]:rounded-2xl [&_.bg-card]:shadow-[0_8px_24px_rgb(17_13_13_/_0.06)]">
          {children}
        </main>
      </div>
    </div>
  );
}
