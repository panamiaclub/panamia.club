import { and, eq, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushDevices } from '@/lib/schema';

export async function registerPushDevice(
  session: { id: string; userId: string },
  device: {
    id: string;
    platform: 'ios' | 'android';
    token: string;
    messagePreviews?: boolean;
  }
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ messagePreviews: pushDevices.messagePreviews })
      .from(pushDevices)
      .where(eq(pushDevices.id, device.id))
      .for('update');
    // Reassignment/rotation removes the previous account's queued deliveries.
    await tx
      .delete(pushDevices)
      .where(
        or(
          and(
            eq(pushDevices.id, device.id),
            or(
              ne(pushDevices.sessionId, session.id),
              ne(pushDevices.token, device.token)
            )
          ),
          and(
            eq(pushDevices.token, device.token),
            ne(pushDevices.id, device.id)
          )
        )
      );
    const [registered] = await tx
      .insert(pushDevices)
      .values({
        ...device,
        messagePreviews:
          device.messagePreviews ?? previous?.messagePreviews ?? true,
        sessionId: session.id,
        userId: session.userId,
      })
      .onConflictDoUpdate({
        target: pushDevices.id,
        set: {
          updatedAt: new Date(),
          ...(device.messagePreviews === undefined
            ? {}
            : { messagePreviews: device.messagePreviews }),
        },
        setWhere: eq(pushDevices.sessionId, session.id),
      })
      .returning({ messagePreviews: pushDevices.messagePreviews });
    if (!registered)
      throw new Error('Concurrent device reassignment; retry registration');
    return registered.messagePreviews;
  });
}
