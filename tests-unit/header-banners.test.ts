import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const header = readFileSync(
  new URL('../components/MainHeader.tsx', import.meta.url),
  'utf8'
);
const banner = readFileSync(
  new URL('../components/CallToActionBar.tsx', import.meta.url),
  'utf8'
);

describe('main header banners', () => {
  test('only mounts explicit profile and test-site announcements', () => {
    const banners = [...header.matchAll(/<CallToActionBar\b[^>]*\/>/g)];
    assert.equal(banners.length, 2);
    assert.deepEqual(
      banners
        .map(([element]) => element.match(/variant="([^"]+)"/)?.[1])
        .sort(),
      ['complete-profile', 'test-site']
    );
    assert.doesNotMatch(
      banner,
      /cta\.(?:stayUpdated|signUpNewsletter)|#newsletter-signup/
    );
  });

  test('preserves the warning for signed-out visitors on test sites only', () => {
    assert.match(
      header,
      /status !== 'loading'\s*&&\s*!isProductionSite\s*&&\s*!isShopRoute\s*&&\s*!session\s*&&\s*\(\s*<div id="call-to-action-bar">\s*<CallToActionBar variant="test-site"/
    );
    assert.ok(banner.includes("t('cta.visitingTestSite')"));
    assert.ok(banner.includes('href="https://www.panamia.club"'));
  });

  test('preserves the profile reminder outside shop and onboarding routes', () => {
    assert.match(
      header,
      /status !== 'loading'\s*&&\s*session\s*&&\s*hasProfile === false\s*&&\s*!isShopRoute\s*&&\s*!isOnboardingRoute\(pathname\)\s*&&\s*\(\s*<div id="call-to-action-bar">\s*<CallToActionBar variant="complete-profile"/
    );
    assert.ok(banner.includes("variant === 'complete-profile'"));
    assert.ok(
      banner.includes(
        '<Link href="/welcome">{t(\'cta.completeYourProfile\')}</Link>'
      )
    );
  });
});
