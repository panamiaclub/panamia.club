import { NextResponse } from 'next/server';

import {
  createAndSendCampaign,
  isCommunityAudienceId,
  previewAudience,
  validateCampaignInput,
} from '@/lib/admin/community-notifications';
import { checkSameOrigin } from '@/lib/csrf';
import { checkAdminAuth } from '@/lib/server/admin-auth';

export async function POST(request: Request) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) {
    console.warn(
      `[admin:community-notifications] origin check failed: ${origin.reason}`
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Could not read that request.' },
      { status: 400 }
    );
  }

  try {
    if (payload.action === 'preview') {
      if (!isCommunityAudienceId(payload.audienceId)) {
        return NextResponse.json(
          { error: 'Choose a valid audience.' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        data: await previewAudience(payload.audienceId),
      });
    }

    if (payload.action === 'send') {
      const validation = validateCampaignInput(payload);
      if (!validation.ok || !validation.value) {
        return NextResponse.json(
          { error: validation.error ?? 'Campaign is invalid.' },
          { status: 400 }
        );
      }

      const campaign = await createAndSendCampaign(validation.value, admin.id);
      return NextResponse.json({ data: campaign });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('[admin:community-notifications]', error);
    const message =
      error instanceof Error ? error.message : 'Community notification failed.';
    const status = message.startsWith('HighLevel is not configured')
      ? 503
      : message === 'Campaign request is already processing.'
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
