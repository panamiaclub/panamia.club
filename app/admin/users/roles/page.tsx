import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Roles & permissions | Pana Admin',
  robots: { index: false, follow: false },
};

export default function AdminRolesRedirectPage() {
  redirect('/admin/users?state=staff');
}
