import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { checkSameOrigin } from '@/lib/csrf';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import {
  getSmsSubscriptionForUser,
  requestIp,
  SMS_DISCLOSURE,
  subscribeProfileToSms,
  unsubscribeProfileFromSms,
} from '@/lib/sms-subscriptions';

async function identityProfile(userId: string) {
  return db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
    columns: { id: true },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    data: await getSmsSubscriptionForUser(session.user.id),
    disclosure: SMS_DISCLOSURE,
  });
}

export async function POST(request: Request) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { phone?: unknown; consent?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'Could not read that request.' },
      { status: 400 }
    );
  }

  if (body.consent !== true || typeof body.phone !== 'string') {
    return NextResponse.json(
      { error: 'A mobile number and explicit consent are required.' },
      { status: 400 }
    );
  }

  const profile = await identityProfile(session.user.id);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  try {
    const subscription = await subscribeProfileToSms({
      profileId: profile.id,
      phone: body.phone,
      source: 'account_settings',
      ip: requestIp(request),
    });
    return NextResponse.json(
      { data: subscription },
      { status: subscription.status === 'pending' ? 202 : 200 }
    );
  } catch (error) {
    console.error('[crm:sms-subscription:post]', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not save SMS preferences.',
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await identityProfile(session.user.id);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const subscription = await unsubscribeProfileFromSms(profile.id);
  return NextResponse.json({ data: subscription });
}
