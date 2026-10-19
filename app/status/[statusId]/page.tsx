import { redirect, notFound } from 'next/navigation';
import { getStatus } from '@/lib/federation/wrappers/status';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';

export default async function StatusRedirectPage({
  params,
}: {
  params: Promise<{ statusId: string }>;
}) {
  const { statusId } = await params;

  const session = await auth();
  const profile = session?.user?.id
    ? await getActiveProfileWithActor(session.user.id)
    : null;
  const status = await getStatus(statusId, profile?.socialActor?.id);

  if (!status) {
    notFound();
  }

  redirect(`/p/${status.actor.username}/${statusId}/`);
}
