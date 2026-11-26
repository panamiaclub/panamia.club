import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { normalizeUsZip } from '@/lib/online-zip';
import { isAccountZipExemptRoute } from '@/lib/onboarding';

export async function requireAccountZip(
  pathname: string | null,
  search: string = ''
) {
  if (!pathname || isAccountZipExemptRoute(pathname)) return;
  const session = await auth();
  if (!session?.user?.id) return;

  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { zipCode: true },
  });
  if (currentUser && !normalizeUsZip(currentUser.zipCode)) {
    redirect(`/welcome/zip?next=${encodeURIComponent(`${pathname}${search}`)}`);
  }
}
