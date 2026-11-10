import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_REVIEW_STEPS,
  hasListingPrimaryPhoto,
  isClaimListingContext,
  listingReviewFinishPath,
  listingReviewNavigation,
  listingReviewStepPath,
  isListingLocationMode,
  publicVisitingAddressIssue,
} from '@/lib/listing-review';
import {
  listingClaimPath,
  listingPublicPath,
  listingReviewPath,
} from '@/lib/listing-url';
import { isOnboardingRoute } from '@/lib/onboarding';
import {
  changedProfileTextFields,
  listSelectedCategories,
} from '@/lib/profile';
import {
  LISTING_INVITATION_DAYS,
  isListingInvitationState,
  listingInvitationPath,
  readListingInvitationFragment,
} from '@/lib/listing-invitation';

test('only a real saved primary media URL meets the business-review photo requirement', () => {
  for (const value of [
    'https://files.test.invalid/profile/business/primary123.jpg',
    'https://legacy-media.test.invalid/business-logo.png',
    'https://legacy-media.test.invalid/logos/business-logo.png',
    'https://legacy-media.test.invalid/icons/business-logo.webp',
    '/profile/business/primary123.webp',
    '/img/businesses/synthetic-bakery.jpg',
    ' https://files.test.invalid/saved-photo.png ',
  ]) {
    assert.equal(hasListingPrimaryPhoto(value), true, value);
  }
  for (const value of [
    undefined,
    null,
    '',
    ' \t\n ',
    true,
    {},
    { primaryCDN: 'https://files.test.invalid/gallery.jpg' },
    'data:image/png;base64,c2VlZC1wbGFjZWhvbGRlcg==',
    'blob:https://directory.test.invalid/unsaved-file',
    'javascript:alert(1)',
    '//files.test.invalid/photo.png',
    'profile/business/primary123.jpg',
    'https://files.test.invalid/',
    'https://user:password@files.test.invalid/photo.jpg',
    '/logos/logo.png',
    'https://directory.test.invalid/logos/pana_logo_long_blue.png',
    '/meta_image.jpg',
    '/social-preview-flower.jpg',
    '/favicon.png',
    '/images/placeholder.png',
    'https://files.test.invalid/default-avatar.png',
    'https://files.test.invalid/%70laceholder.png',
  ]) {
    assert.equal(hasListingPrimaryPhoto(value), false, String(value));
  }
});

test('location choices are explicit and a public visiting address needs street, city and state', () => {
  for (const mode of ['storefront', 'online', 'mobile']) {
    assert.equal(isListingLocationMode(mode), true);
  }
  for (const mode of [undefined, null, '', 'keep', 'public', true, {}]) {
    assert.equal(isListingLocationMode(mode), false);
  }
  const address = {
    street1: '123 Synthetic Street',
    city: 'Miami',
    state: 'FL',
  };
  assert.equal(publicVisitingAddressIssue(address), null);
  for (const field of ['street1', 'city', 'state'] as const) {
    for (const value of ['', ' \t ', null, undefined, 123, {}]) {
      assert.equal(
        publicVisitingAddressIssue({ ...address, [field]: value })?.field,
        field
      );
    }
  }
});

test('listing entry, review and editor destinations carry only the explicitly selected profile ID', () => {
  const id = 'public-id /?&';
  assert.equal(
    listingClaimPath(id),
    '/listings/claim/start?id=public-id%20%2F%3F%26'
  );
  assert.equal(
    listingReviewPath(id),
    '/listings/review?id=public-id%20%2F%3F%26'
  );
  assert.equal(LISTING_REVIEW_STEPS[0].key, 'address');
  for (const step of LISTING_REVIEW_STEPS) {
    const url = new URL(
      listingReviewStepPath(id, step.key),
      'https://directory.test.invalid'
    );
    assert.equal(url.pathname, `/account/profile/${step.key}`);
    assert.equal(url.searchParams.get('listingId'), id);
    assert.equal(url.searchParams.size, 1);
  }
  assert.equal(
    listingPublicPath({ id: 'public-id', screenname: ' bakery ' }),
    '/p/bakery'
  );
});

test('a public claim response must identify the requested listing and validate management booleans', () => {
  const context = {
    profileId: 'public-id',
    name: 'Bakery',
    summary: 'Fresh bread',
    imageUrl: null,
    publicPath: '/listings/public-id',
    locationLabel: 'Location not added yet',
    missingLocation: true,
    canManage: false,
    claimable: true,
  };
  assert.equal(isClaimListingContext(context, 'public-id'), true);
  assert.equal(isClaimListingContext(context, 'other-id'), false);
  assert.equal(
    isClaimListingContext({ ...context, canManage: 'true' }, 'public-id'),
    false
  );
  assert.equal(isClaimListingContext({ name: 'Bakery' }, 'public-id'), false);
  assert.equal(isClaimListingContext(null, 'public-id'), false);
});

test('wizard Back and Continue stay on adjacent exact-business steps, with only Photos leading to confirmation', () => {
  const id = 'public-id /?&';
  for (const [index, step] of LISTING_REVIEW_STEPS.entries()) {
    const navigation = listingReviewNavigation(id, step.key);
    const previous = LISTING_REVIEW_STEPS[index - 1];
    const next = LISTING_REVIEW_STEPS[index + 1];
    assert.equal(
      navigation.backHref,
      previous
        ? `/account/profile/${previous.key}?listingId=public-id%20%2F%3F%26`
        : '/listings/claim/start?id=public-id%20%2F%3F%26'
    );
    assert.equal(
      navigation.nextHref,
      next
        ? `/account/profile/${next.key}?listingId=public-id%20%2F%3F%26`
        : '/listings/review?id=public-id%20%2F%3F%26&complete=1'
    );
  }
  assert.equal(
    listingReviewFinishPath(id),
    '/listings/review?id=public-id%20%2F%3F%26&complete=1'
  );
});

test('claim and review do not force personal social onboarding', () => {
  assert.equal(isOnboardingRoute('/listings/claim/start'), true);
  assert.equal(isOnboardingRoute('/listings/claim'), true);
  assert.equal(isOnboardingRoute('/listings/review'), true);
  assert.equal(isOnboardingRoute('/listings/a-public-id'), false);
});

test('the review summary lists only selected categories, not saved false flags', () => {
  assert.equal(
    listSelectedCategories({ food: true, services: false, art: true }),
    'Food, Art'
  );
  assert.equal(listSelectedCategories({ food: false, services: false }), '');
});

test('review text patches preserve untouched nulls, missing fields, casing and unrelated information', () => {
  assert.deepEqual(
    changedProfileTextFields(
      {
        email: 'Hello@Business.TEST',
        background: '',
        tags: '',
        details: 'New details',
      },
      {
        email: 'Hello@Business.TEST',
        background: null,
        details: 'Old details',
        preserved: 'Do not touch',
      }
    ),
    { details: 'New details' }
  );
  assert.deepEqual(
    changedProfileTextFields(
      { details: '' },
      { details: 'Explicitly remove this' }
    ),
    { details: '' }
  );
});

test('invitation fragments keep proof out of stable return URLs and reject extra redirect or proof inputs', () => {
  const token = 'ab'.repeat(32);
  assert.equal(LISTING_INVITATION_DAYS, 7);
  assert.equal(readListingInvitationFragment(`#token=${token}`), token);
  for (const hash of [
    '',
    '#token=unknown',
    '#token=' + 'a'.repeat(63),
    '#token=' + token + '&next=//foreign.test',
    '#token=' + token + '&token=' + token,
  ]) {
    assert.equal(readListingInvitationFragment(hash), null);
  }
  const path = listingInvitationPath('public-id &next=//foreign.test');
  const url = new URL(path, 'https://directory.test.invalid');
  assert.equal(url.pathname, '/listings/invite');
  assert.equal(url.searchParams.get('id'), 'public-id &next=//foreign.test');
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.hash, '');
  assert.equal(isOnboardingRoute('/listings/invite'), true);
});

test('only scoped, valid invitation inspection responses can show a confirmation action', () => {
  const available = {
    profileId: 'id',
    state: 'available',
    expiresAt: '2026-11-09T00:00:00Z',
  };
  assert.equal(isListingInvitationState(available, 'id'), true);
  assert.equal(isListingInvitationState(available, 'other-id'), false);
  assert.equal(
    isListingInvitationState({ ...available, expiresAt: 'not-a-date' }, 'id'),
    false
  );
  assert.equal(
    isListingInvitationState({ ...available, state: 'claimed' }, 'id'),
    false
  );
  assert.equal(
    isListingInvitationState(
      { profileId: 'id', state: 'owned', expiresAt: null },
      'id'
    ),
    true
  );
  assert.equal(isListingInvitationState(null, 'id'), false);
});
