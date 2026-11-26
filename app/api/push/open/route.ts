import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { notifications } from '@/lib/schema';
import { isBlockedBetweenUsers, markAsRead } from '@/lib/notifications';
import { pushDestination } from '@/lib/push/payload';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const session = await auth();
    if (!session)
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const row = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.id, id),
        eq(notifications.target, session.user.id)
      ),
    });
    if (
      !row ||
      (row.expiresAt && row.expiresAt <= new Date()) ||
      (await isBlockedBetweenUsers(row.actor, row.target))
    ) {
      return Response.json({ href: '/updates' }, { headers });
    }
    await markAsRead(id, session.user.id);
    return Response.json({ href: pushDestination(row.objectUrl) }, { headers });
  } catch {
    console.error('[push] Could not open notification');
    return Response.json(
      { error: 'Could not open notification' },
      { status: 500, headers }
    );
  }
}
