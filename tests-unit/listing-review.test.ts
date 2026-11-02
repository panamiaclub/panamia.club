import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_REVIEW_STEPS,
  isClaimListingContext,
  listingReviewStepPath,
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
