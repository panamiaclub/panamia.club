import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysAfter,
  isListingReviewState,
  LISTING_REFRESH_DAYS,
  LISTING_REMINDER_DAYS,
  refreshStopPath,
} from '@/lib/listing-refresh';
import { renderTemplate } from '@/lib/email-templates';
import { escape } from '@/lib/email-templates/layout';

test('review deadlines use explicit thirty-day and seven-day elapsed intervals', () => {
  const start = new Date('2026-11-03T12:00:00Z');
  assert.equal(LISTING_REFRESH_DAYS, 30);
  assert.equal(LISTING_REMINDER_DAYS, 7);
  assert.equal(daysAfter(start, 30).toISOString(), '2026-12-03T12:00:00.000Z');
  assert.equal(daysAfter(start, 7).toISOString(), '2026-11-10T12:00:00.000Z');
});

test('review-state guards reject another business, invalid dates and unsupported lifecycle states', () => {
  const state = {
    profileId: 'business',
    lastReviewedAt: null,
    zipVerified: false,
    primaryPhotoSaved: false,
    remindersOptedOut: false,
    cycle: {
      id: 'cycle',
      state: 'active',
      reminderCount: 0,
      startedAt: '2026-11-03T12:00:00Z',
      dueAt: '2026-12-03T12:00:00Z',
      pausedAt: null,
      holdReason: null,
    },
  };
  assert.equal(isListingReviewState(state, 'business'), true);
  assert.equal(isListingReviewState(state, 'different'), false);
  assert.equal(
    isListingReviewState({ ...state, zipVerified: undefined }, 'business'),
    false
  );
  assert.equal(
    isListingReviewState({ ...state, zipVerified: 'true' }, 'business'),
    false
  );
  for (const primaryPhotoSaved of [undefined, null, 'true', 1]) {
    assert.equal(
      isListingReviewState({ ...state, primaryPhotoSaved }, 'business'),
      false
    );
  }
  assert.equal(
    isListingReviewState(
      { ...state, cycle: { ...state.cycle, state: 'unknown' } },
      'business'
    ),
    false
  );
  assert.equal(
    isListingReviewState(
      { ...state, cycle: { ...state.cycle, dueAt: 'invalid' } },
      'business'
    ),
    false
  );
  assert.equal(
    isListingReviewState(
      { ...state, cycle: { ...state.cycle, reminderCount: 5 } },
      'business'
    ),
    false
  );
});

test('stop-reminder links contain only a scoped cycle ID in the query, with proof in the fragment', () => {
  const url = new URL(
    refreshStopPath('cycle /?&', 'ab'.repeat(32)),
    'https://pana.test'
  );
  assert.equal(url.searchParams.get('cycleId'), 'cycle /?&');
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.searchParams.has('token'), false);
  assert.match(url.hash, /^#token=/);
});

test('final reminder copy requires confirmation, explains recoverable hiding and escapes public business input', () => {
  const mail = renderTemplate('listing.refresh', {
    businessName: '<script>business</script>',
    reviewUrl: 'https://pana.test/listings/invite?id=business#token=fixture',
    stopUrl:
      'https://pana.test/listings/reminders/stop?cycleId=cycle#token=fixture',
    finalNotice: true,
    deadline: '2026-12-03',
    deliveryId: 'delivery-reference',
  });
  assert.match(mail.subject, /Final listing reminder/);
  assert.doesNotMatch(mail.html, /<script>business<\/script>/);
  assert.match(mail.text, /Signing in or claiming alone does not finish/);
  assert.match(mail.text, /Every business needs a valid five-digit US ZIP/);
  assert.match(
    mail.text,
    /A public visiting location needs a street address, city, state and ZIP/
  );
  assert.match(
    mail.text,
    /Online and mobile services need only a business base ZIP, not a street or home address/
  );
  assert.match(mail.text, /delivery-reference/);
  assert.match(mail.html, /temporary pause, not a deletion/);
});

test('every refresh stage preserves personalized proof links, deadline and complete text disclosures', () => {
  const name = 'Neighborhood & Makers <business> "Studio"';
  const reviewUrl =
    'https://preview.invalid/listings/invite?id=business&source=notice#token=fixture-proof';
  const stopUrl =
    'https://preview.invalid/listings/reminders/stop?cycleId=cycle&source=notice#token=fixture-proof';
  const stages = [
    {
      flags: {},
      subject: 'Review your PanaMia listing',
      heading: "Let's refresh",
    },
    {
      flags: { reminderNotice: true },
      subject: 'Listing review reminder',
      heading: 'A friendly reminder',
    },
    {
      flags: { reminderNotice: true, finalNotice: true },
      subject: 'Final listing reminder',
      heading: 'A last reminder',
    },
  ];
  for (const stage of stages) {
    const mail = renderTemplate('listing.refresh', {
      ...stage.flags,
      businessName: name,
      reviewUrl,
      stopUrl,
      deadline: '2027-05-18',
      deliveryId: 'safe-fixture-reference',
    });
    assert.ok(mail.subject.startsWith(stage.subject));
    assert.ok(mail.text.startsWith(stage.heading));
    for (const copy of [
      name,
      '2027-05-18',
      'business contact or belongs to an account that manages',
      'weekly',
      'temporarily hidden after 2027-05-18',
      'temporary pause, not a deletion',
      'Signing in or claiming alone does not finish the review.',
      '"Confirm business information"',
      'Every business needs a valid five-digit US ZIP',
      'including online and mobile services.',
      'A saved primary business photo is also required.',
      'An existing primary photo counts; you do not need to upload it again.',
      'Gallery photos are optional.',
      'A public visiting location needs a street address, city, state and ZIP.',
      'Online and mobile services need only a business base ZIP, not a street or home address.',
      'only an approximate base area, not a service or delivery boundary.',
      'Use a real ZIP; do not make one up.',
      'New to Pana? Create an account with Google or an email you control.',
      'Your login email does not have to match the business email on this listing.',
      'Use the Pana account that manages it.',
      'use its private invitation to confirm that you manage it after signing in, then review its details.',
      'A valid invitation verifies access to the business inbox; no second business verification email is needed.',
      'Private invitation links work once and expire after seven days.',
      'an authorized manager can review and confirm it to restore it.',
      'Staff decisions remain separate.',
      'Stopping reminders does not confirm your listing',
      'not treated as an ignored notice.',
      'safe-fixture-reference',
    ]) {
      assert.ok(mail.html.includes(escape(copy)), `HTML missing: ${copy}`);
      assert.ok(mail.text.includes(copy), `plain text missing: ${copy}`);
    }
    for (const body of [mail.html, mail.text]) {
      const start = body.indexOf('New to Pana?');
      const emailReassurance = body.indexOf(
        'Your login email does not have to match'
      );
      assert.ok(start >= 0);
      assert.ok(emailReassurance > start);
      for (const detail of [
        'Review and confirm my listing',
        'A few things worth checking',
        'Every business needs a valid five-digit US ZIP',
        'A saved primary business photo is also required.',
      ]) {
        assert.ok(
          body.indexOf(detail) > emailReassurance,
          `account reassurance must precede ${detail}`
        );
      }
      assert.equal(body.split('New to Pana?').length - 1, 1);
    }
    for (const url of [reviewUrl, stopUrl]) {
      assert.equal(mail.html.split(`href="${escape(url)}"`).length - 1, 1);
      assert.ok(
        mail.html.includes(
          `href="${escape(url)}" rel="noreferrer" referrerpolicy="no-referrer"`
        )
      );
      assert.ok(mail.text.includes(url));
    }
    assert.doesNotMatch(mail.html, /<business>|&amp;amp; Makers/);
    assert.doesNotMatch(
      mail.text,
      /ZIP only if appropriate|no ZIP is required/i
    );
  }
});

test('owned listing URLs and strict notice flags are not converted into invitation links', () => {
  const reviewUrl = 'https://preview.invalid/listings/review?id=owned-business';
  const mail = renderTemplate('listing.refresh', {
    businessName: 'Owned Studio',
    reviewUrl,
    stopUrl:
      'https://preview.invalid/listings/reminders/stop?cycleId=cycle#token=fixture-proof',
    deadline: '2027-05-18',
    reminderNotice: 'true',
    finalNotice: 'true',
  });
  assert.match(mail.subject, /^Review your PanaMia listing:/);
  assert.ok(mail.html.includes(`href="${reviewUrl}"`));
  assert.ok(mail.text.includes(reviewUrl));
  assert.doesNotMatch(mail.html, /\/listings\/invite\?/);
  for (const body of [mail.html, mail.text]) {
    assert.ok(body.includes('New to Pana? Create an account'));
    assert.ok(body.includes('Already manage this listing?'));
    assert.ok(body.includes('If this listing is unclaimed,'));
  }
});
