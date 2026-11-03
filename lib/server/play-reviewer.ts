import { hashPassword } from 'better-auth/crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, profiles, sessions, users } from '@/lib/schema';
import {
  PLAY_REVIEW_EMAIL,
  PLAY_REVIEW_NAME,
  PLAY_REVIEW_SCREENNAME,
} from '@/lib/play-reviewer';
import { isScreennameAvailable } from '@/lib/screenname';
import { isAdminEmail } from '@/lib/server/admin-emails';

export class PlayReviewerProvisioningError extends Error {}

export async function provisionPlayReviewer(
  password: string,
  rotatePassword = false
) {
  if (
    password.length < 32 ||
    password.length > 128 ||
    /[\r\n]/.test(password)
  ) {
    throw new PlayReviewerProvisioningError(
      'Review password must contain 32-128 characters without newlines.'
    );
  }
  if (isAdminEmail(PLAY_REVIEW_EMAIL)) {
    throw new PlayReviewerProvisioningError(
      'The review account must not be in ADMIN_EMAILS.'
    );
  }

  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${PLAY_REVIEW_EMAIL}`,
  });
  if (!existing && !(await isScreennameAvailable(PLAY_REVIEW_SCREENNAME))) {
    throw new PlayReviewerProvisioningError(
      'The review screenname is already in use; no account was changed.'
    );
  }
  const passwordHash = await hashPassword(password);

  return db.transaction(async (transaction) => {
    const user = await transaction.query.users.findFirst({
      where: sql`lower(${users.email}) = ${PLAY_REVIEW_EMAIL}`,
    });
    if (user) {
      if (!rotatePassword) {
        throw new PlayReviewerProvisioningError(
          'Review account already exists; explicitly request password rotation.'
        );
      }
      const profile = await transaction.query.profiles.findFirst({
        where: eq(profiles.userId, user.id),
      });
      const credentials = await transaction
        .select()
        .from(accounts)
        .where(eq(accounts.userId, user.id));
      const hasStaffRole =
        profile?.roles !== null &&
        typeof profile?.roles === 'object' &&
        Object.values(profile.roles).some((value) => value === true);
      if (
        user.email !== PLAY_REVIEW_EMAIL ||
        user.name !== PLAY_REVIEW_NAME ||
        user.screenname !== PLAY_REVIEW_SCREENNAME ||
        user.accountType !== 'personal' ||
        !profile ||
        profile.name !== PLAY_REVIEW_NAME ||
        profile.screenname !== PLAY_REVIEW_SCREENNAME ||
        hasStaffRole ||
        credentials.length !== 1 ||
        credentials[0].providerId !== 'credential' ||
        credentials[0].accountId !== user.id
      ) {
        throw new PlayReviewerProvisioningError(
          'Existing account is not an unprivileged review account; refusing changes.'
        );
      }
      await transaction
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(
          and(
            eq(accounts.userId, user.id),
            eq(accounts.providerId, 'credential')
          )
        );
      await transaction.delete(sessions).where(eq(sessions.userId, user.id));
      return { created: false, userId: user.id };
    }
    if (rotatePassword) {
      throw new PlayReviewerProvisioningError(
        'Review account does not exist; run initial provisioning instead.'
      );
    }

    const [created] = await transaction
      .insert(users)
      .values({
        email: PLAY_REVIEW_EMAIL,
        emailVerified: true,
        name: PLAY_REVIEW_NAME,
        screenname: PLAY_REVIEW_SCREENNAME,
        accountType: 'personal',
      })
      .returning({ id: users.id });
    await transaction.insert(profiles).values({
      userId: created.id,
      email: PLAY_REVIEW_EMAIL,
      name: PLAY_REVIEW_NAME,
      screenname: PLAY_REVIEW_SCREENNAME,
      active: false,
      roles: {},
      verification: {},
      ghlOptedOut: true,
      descriptions: {
        en: 'Operator-issued demonstration account for app review, not a resident or business listing.',
      },
    });
    await transaction.insert(accounts).values({
      userId: created.id,
      accountId: created.id,
      providerId: 'credential',
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { created: true, userId: created.id };
  });
}
