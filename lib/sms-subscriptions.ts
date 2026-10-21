import { eq, isNotNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { GhlClient, GHL_DND_CHANNELS } from '@/lib/ghl';
import { profiles, smsSubscriptions } from '@/lib/schema';

export const SMS_CONSENT_VERSION = '2026-10-21.v1';
export const SMS_DISCLOSURE =
  'I agree to receive community and Connector text messages from Pana MIA. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';

export type SmsConsentSource = 'account_settings' | 'connectors_join';
export type SmsSubscriptionStatus = 'pending' | 'active' | 'opted_out';

export interface SmsSubscriptionView {
  phone: string;
  status: SmsSubscriptionStatus;
  consentVersion: string;
  consentSource: string;
  consentedAt: string | null;
  optedOutAt: string | null;
  syncedAt: string | null;
  syncError: string | null;
}

function toView(
  row: typeof smsSubscriptions.$inferSelect
): SmsSubscriptionView {
  return {
    phone: row.phone,
    status: row.status as SmsSubscriptionStatus,
    consentVersion: row.consentVersion,
    consentSource: row.consentSource,
    consentedAt: row.consentedAt?.toISOString() ?? null,
    optedOutAt: row.optedOutAt?.toISOString() ?? null,
    syncedAt: row.syncedAt?.toISOString() ?? null,
    syncError: row.syncError,
  };
}

export function normalizeSmsPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function names(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function requireGhl() {
  const ghl = GhlClient.create();
  if (!ghl) {
    throw new Error(
      'HighLevel is not configured. GHL_API_KEY and GHL_LOCATION_ID are required.'
    );
  }
  return ghl;
}

async function syncSubscription(profileId: string) {
  const row = await db
    .select({
      profileId: profiles.id,
      name: profiles.name,
      email: profiles.email,
      ghlContactId: profiles.ghlContactId,
      phone: smsSubscriptions.phone,
      status: smsSubscriptions.status,
    })
    .from(profiles)
    .innerJoin(smsSubscriptions, eq(smsSubscriptions.profileId, profiles.id))
    .where(eq(profiles.id, profileId))
    .limit(1);

  const record = row[0];
  if (!record) throw new Error('SMS subscription profile was not found.');

  const ghl = requireGhl();
  const contact =
    record.status === 'opted_out'
      ? await ghl.resolveContact(record.ghlContactId, record.email)
      : (
          await ghl.upsertContact({
            ...names(record.name),
            email: record.email,
            phone: record.phone,
          })
        ).contact;

  if (!contact) {
    await db
      .update(smsSubscriptions)
      .set({
        syncedAt: new Date(),
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(smsSubscriptions.profileId, profileId));
    return;
  }

  const current = await ghl.getContactById(contact.id);
  const active = Object.fromEntries(
    GHL_DND_CHANNELS.map((channel) => [
      channel,
      channel === 'SMS'
        ? record.status === 'opted_out'
        : current.dndSettings?.[channel]?.status === 'active' ||
          (current.dnd === true &&
            current.dndSettings?.[channel]?.status === undefined),
    ])
  ) as Record<(typeof GHL_DND_CHANNELS)[number], boolean>;

  await ghl.setDndChannels(contact.id, active);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({
        ghlContactId: contact.id,
        ghlOptedOut: false,
      })
      .where(eq(profiles.id, profileId));
    await tx
      .update(smsSubscriptions)
      .set({
        status: record.status === 'opted_out' ? 'opted_out' : 'active',
        syncedAt: now,
        syncError: null,
        updatedAt: now,
      })
      .where(eq(smsSubscriptions.profileId, profileId));
  });
}

export async function subscribeProfileToSms(params: {
  profileId: string;
  phone: string;
  source: SmsConsentSource;
  ip: string | null;
}): Promise<SmsSubscriptionView> {
  const phone = normalizeSmsPhone(params.phone);
  if (!phone) {
    throw new Error(
      'Enter a valid mobile number, including the country code when outside the US.'
    );
  }

  const now = new Date();
  await db
    .insert(smsSubscriptions)
    .values({
      profileId: params.profileId,
      phone,
      status: 'pending',
      consentVersion: SMS_CONSENT_VERSION,
      consentSource: params.source,
      consentIp: params.ip,
      consentedAt: now,
      optedOutAt: null,
      syncedAt: null,
      syncError: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: smsSubscriptions.profileId,
      set: {
        phone,
        status: 'pending',
        consentVersion: SMS_CONSENT_VERSION,
        consentSource: params.source,
        consentIp: params.ip,
        consentedAt: now,
        optedOutAt: null,
        syncedAt: null,
        syncError: null,
        updatedAt: now,
      },
    });

  try {
    await syncSubscription(params.profileId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : String(error);
    console.error(
      `[sms-subscription] sync failed for ${params.profileId}:`,
      error
    );
    await db
      .update(smsSubscriptions)
      .set({ syncError: message, updatedAt: new Date() })
      .where(eq(smsSubscriptions.profileId, params.profileId));
  }

  const subscription = await db.query.smsSubscriptions.findFirst({
    where: eq(smsSubscriptions.profileId, params.profileId),
  });
  if (!subscription) throw new Error('SMS subscription was not saved.');
  return toView(subscription);
}

export async function unsubscribeProfileFromSms(
  profileId: string
): Promise<SmsSubscriptionView | null> {
  const existing = await db.query.smsSubscriptions.findFirst({
    where: eq(smsSubscriptions.profileId, profileId),
  });
  if (!existing) return null;

  const now = new Date();
  await db
    .update(smsSubscriptions)
    .set({
      status: 'opted_out',
      optedOutAt: now,
      syncedAt: null,
      syncError: null,
      updatedAt: now,
    })
    .where(eq(smsSubscriptions.profileId, profileId));

  try {
    await syncSubscription(profileId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : String(error);
    console.error(
      `[sms-subscription] opt-out sync failed for ${profileId}:`,
      error
    );
    await db
      .update(smsSubscriptions)
      .set({ syncError: message, updatedAt: new Date() })
      .where(eq(smsSubscriptions.profileId, profileId));
  }

  const subscription = await db.query.smsSubscriptions.findFirst({
    where: eq(smsSubscriptions.profileId, profileId),
  });
  return subscription ? toView(subscription) : null;
}

export async function getSmsSubscriptionForUser(
  userId: string
): Promise<SmsSubscriptionView | null> {
  const rows = await db
    .select({ subscription: smsSubscriptions })
    .from(profiles)
    .innerJoin(smsSubscriptions, eq(smsSubscriptions.profileId, profiles.id))
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows[0]?.subscription ? toView(rows[0].subscription) : null;
}

export async function retryPendingSmsSubscriptions(limit = 50) {
  const pending = await db.query.smsSubscriptions.findMany({
    where: or(
      eq(smsSubscriptions.status, 'pending'),
      isNotNull(smsSubscriptions.syncError)
    ),
    limit,
  });

  let synced = 0;
  let failed = 0;
  for (const subscription of pending) {
    try {
      await syncSubscription(subscription.profileId);
      synced += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message.slice(0, 500) : String(error);
      await db
        .update(smsSubscriptions)
        .set({ syncError: message, updatedAt: new Date() })
        .where(eq(smsSubscriptions.profileId, subscription.profileId));
      console.error(
        `[sms-subscription] retry failed for ${subscription.profileId}:`,
        error
      );
    }
  }
  return { attempted: pending.length, synced, failed };
}

export function requestIp(request: Request): string | null {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}
