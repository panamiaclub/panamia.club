import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listingPreviewPath,
  listingPublicPath,
  listingSetupPath,
} from '@/lib/listing-url';
import { listingSetup } from '@/lib/email-templates/listing-setup';
import { profilePublished } from '@/lib/email-templates/profile-published';
import { isOnboardingRoute } from '@/lib/onboarding';

test('public business URLs do not require an owner or handle', () => {
  assert.equal(
    listingPublicPath({ id: 'business-id' }),
    '/listings/business-id'
  );
  assert.equal(
    listingPublicPath({ id: 'business-id', screenname: ' ' }),
    '/listings/business-id'
  );
  assert.equal(
    listingPublicPath({ id: 'business-id', screenname: ' local-shop ' }),
    '/p/local-shop'
  );
  assert.equal(listingPublicPath({ id: 'a/b?c' }), '/listings/a%2Fb%3Fc');
  assert.equal(
    listingPublicPath({ id: 'business-id', screenname: 'a/b' }),
    '/p/a%2Fb'
  );
  assert.equal(listingSetupPath('a&b'), '/listings/setup?profileId=a%26b');
});

test('business intake and setup are not hijacked by personal screenname onboarding', () => {
  assert.equal(isOnboardingRoute('/form/get-listed'), true);
  assert.equal(isOnboardingRoute('/listings/setup'), true);
  assert.equal(isOnboardingRoute('/listings/business-id'), false);
});

test('unpublished business previews use an encoded admin-only route', () => {
  assert.equal(
    listingPreviewPath('business-id'),
    '/admin/listings/business-id/preview'
  );
  assert.equal(
    listingPreviewPath('a/b?c'),
    '/admin/listings/a%2Fb%3Fc/preview'
  );
});

test('the setup email names the business, escapes HTML, and retains a non-expiring recovery path', () => {
  const email = listingSetup({
    businessName: 'Ana <script>alert("x")</script>\r\nBakery',
    signInUrl:
      'https://pana.test/verify?token=example&callbackURL=%2Flistings%2Fsetup',
    setupUrl: 'https://pana.test/listings/setup?profileId=business-id',
  });
  assert.match(email.subject, /^Confirm and manage Ana /);
  assert.doesNotMatch(email.subject, /[\r\n]/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /token=example&amp;callbackURL=/);
  assert.match(email.html, /Opening the link does not assign ownership/);
  assert.match(email.text, /Staff approval is separate/);
  assert.match(
    email.text,
    /https:\/\/pana.test\/listings\/setup\?profileId=business-id/
  );
});

test('approval emails can link to an approved public ID page without a handle', () => {
  const email = profilePublished({
    name: 'Ana & Bakery',
    profileUrl: 'https://pana.test/listings/business-id',
  });
  assert.match(email.html, /Ana &amp; Bakery/);
  assert.match(email.html, /href="https:\/\/pana.test\/listings\/business-id"/);
  assert.match(
    email.text,
    /View your business page: https:\/\/pana.test\/listings\/business-id/
  );
  assert.doesNotMatch(
    profilePublished({ name: 'Legacy profile' }).html,
    /href="undefined"/
  );
});
