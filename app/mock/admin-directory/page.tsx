import type { Metadata } from 'next';
import { DirectoryAdminMock } from './directory-admin-mock';

export const metadata: Metadata = {
  title: 'Mock - Directory admin dashboard',
  robots: { index: false, follow: false },
};

export default function DirectoryAdminMockPage() {
  return <DirectoryAdminMock />;
}
