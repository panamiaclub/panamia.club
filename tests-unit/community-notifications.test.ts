import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isCommunityAudienceId,
  validateCampaignInput,
} from '@/lib/admin/community-notifications';

const NOW = new Date('2026-10-21T16:00:00.000Z');

describe('community notification validation', () => {
  test('accepts a compliant immediate campaign', () => {
    const result = validateCampaignInput(
      {
        requestId: 'c021fac9-aad3-4d46-b39a-7a37fc77760b',
        name: 'Connector circle launch',
        audienceId: 'active-connectors',
        message: 'Pana MIA: Your group is ready. Reply STOP to opt out.',
        scheduledAt: null,
      },
      NOW
    );

    assert.equal(result.ok, true);
    assert.equal(result.value?.scheduledAt, null);
  });

  test('requires sender identification and opt-out instructions', () => {
    const unidentified = validateCampaignInput(
      {
        requestId: 'c021fac9-aad3-4d46-b39a-7a37fc77760b',
        name: 'Launch',
        audienceId: 'active-connectors',
        message: 'Your group is ready. Reply STOP to opt out.',
      },
      NOW
    );
    assert.equal(unidentified.ok, false);
    assert.match(unidentified.error ?? '', /begin with/i);

    const noOptOut = validateCampaignInput(
      {
        requestId: 'c021fac9-aad3-4d46-b39a-7a37fc77760b',
        name: 'Launch',
        audienceId: 'active-connectors',
        message: 'Pana MIA: Your group is ready.',
      },
      NOW
    );
    assert.equal(noOptOut.ok, false);
    assert.match(noOptOut.error ?? '', /Reply STOP/i);
  });

  test('rejects unknown audiences and near-term schedules', () => {
    assert.equal(isCommunityAudienceId('every-profile'), false);

    const result = validateCampaignInput(
      {
        requestId: 'c021fac9-aad3-4d46-b39a-7a37fc77760b',
        name: 'Launch',
        audienceId: 'group-hosts',
        message: 'Pana MIA: Your group is ready. Reply STOP to opt out.',
        scheduledAt: '2026-10-21T16:03:00.000Z',
      },
      NOW
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /five minutes/i);
  });
});
