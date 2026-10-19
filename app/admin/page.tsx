import { AdminOverview } from '@/components/Admin/overview';

/**
 * The admin overview at its named path.
 *
 * The page itself is `components/Admin/overview.tsx`. This file exists to give
 * it a route and metadata. `admin.panamia.club/` redirects here rather than
 * rendering the overview itself, so the sidebar in `app/admin/layout.tsx`
 * applies and there is one canonical URL for this page.
 */

export const metadata = {
  title: 'Admin | Pana MIA Club',
  robots: { index: false, follow: false },
};

export default function AdminOverviewPage() {
  return <AdminOverview />;
}