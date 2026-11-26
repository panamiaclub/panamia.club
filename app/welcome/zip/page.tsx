import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { normalizeUsZip } from '@/lib/online-zip';
import { safeInternalPath } from '@/lib/safe-path';
import { ZipCodeForm } from './zip-code-form';

export const metadata: Metadata = {
  title: 'Account ZIP code | Pana MIA',
  robots: { index: false, follow: false },
};

export default async function AccountZipPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const requested = safeInternalPath(next);
  const destination =
    requested &&
    requested.split(/[?#]/)[0].replace(/\/+$/, '') !== '/welcome/zip'
      ? requested
      : '/welcome';
  const session = await auth();
  if (!session?.user?.id) {
    const callback = `/welcome/zip?next=${encodeURIComponent(destination)}`;
    redirect(`/signin?callbackUrl=${encodeURIComponent(callback)}`);
  }
  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { zipCode: true },
  });
  if (!currentUser) notFound();
  if (normalizeUsZip(currentUser.zipCode)) redirect(destination);

  return <ZipCodeForm destination={destination} />;
}
