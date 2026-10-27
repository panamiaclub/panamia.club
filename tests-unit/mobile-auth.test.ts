import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MAGIC_LINK_VERIFY_PATH,
  MOBILE_MAGIC_LINK_PATH,
  isAppUrl,
  magicLinkVerificationUrl,
  mobileMagicLinkAppUrl,
  mobileMagicLinkIntentUrl,
  mobileMagicLinkUrl,
  nativeDeepLinkUrl,
  nativeLaunchUrlFingerprint,
} from '@/lib/mobile/auth-links';
import { MOBILE_APP_ID } from '@/lib/mobile/app-identity';
import { hasNativeGoogleSignIn } from '@/lib/mobile/native';

const origin = 'https://panamia.club';

function verificationUrl(host = origin): string {
  const url = new URL(MAGIC_LINK_VERIFY_PATH, host);
  url.search = new URLSearchParams({
    token: 'one-time-email-token',
    callbackURL: `${host}/m/schedule/book?mentor=taylor&mode=video`,
    newUserCallbackURL: `${host}/welcome?next=%2Fs`,
    errorCallbackURL: `${host}/signin?callbackUrl=%2Fm`,
  }).toString();
  return url.href;
}

describe('mobile email sign-in links', () => {
  test('keeps the original token and every callback intact without verifying', () => {
    for (const host of [origin, 'https://social.panamia.club']) {
      const original = verificationUrl(host);
      const mobile = new URL(mobileMagicLinkUrl(original));
      assert.equal(mobile.origin, host);
      assert.equal(mobile.pathname, MOBILE_MAGIC_LINK_PATH);
      assert.equal(mobile.search, new URL(original).search);
      assert.equal(magicLinkVerificationUrl(mobile.href), original);
    }
  });

  test('the explicit app link carries the unconsumed mobile URL', () => {
    const mobile = mobileMagicLinkUrl(verificationUrl());
    const app = new URL(mobileMagicLinkAppUrl(mobile));
    assert.equal(app.protocol, `${MOBILE_APP_ID}:`);
    assert.equal(app.hostname, 'auth');
    assert.equal(app.pathname, '/magic-link');
    assert.equal(app.searchParams.get('url'), mobile);
    assert.equal(nativeDeepLinkUrl(app.href, origin)?.href, mobile);
  });

  test('Android browser handoff explicitly targets our installed package', () => {
    const mobile = mobileMagicLinkUrl(verificationUrl());
    const intent = mobileMagicLinkIntentUrl(mobile);
    assert.ok(intent.startsWith('intent://auth/magic-link?url='));
    assert.ok(
      intent.endsWith(
        `#Intent;scheme=${MOBILE_APP_ID};package=${MOBILE_APP_ID};end`
      )
    );
    assert.equal(new URL(intent).searchParams.get('url'), mobile);
  });

  test('rejects missing, duplicate, or misplaced credentials', () => {
    for (const url of [
      `${origin}${MAGIC_LINK_VERIFY_PATH}`,
      `${origin}${MAGIC_LINK_VERIFY_PATH}?token=`,
      `${origin}${MAGIC_LINK_VERIFY_PATH}?token=a&token=b`,
      `${verificationUrl()}#fragment`,
      `${origin}/account?token=token`,
      verificationUrl().replace('https://', 'https://someone@'),
      'javascript:alert(1)',
    ]) {
      assert.throws(() => mobileMagicLinkUrl(url));
    }
    assert.throws(() => magicLinkVerificationUrl(verificationUrl()));
  });

  test('fingerprints do not persist a raw sign-in token', async () => {
    const raw = mobileMagicLinkAppUrl(mobileMagicLinkUrl(verificationUrl()));
    const fingerprint = await nativeLaunchUrlFingerprint(raw);
    assert.match(fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(await nativeLaunchUrlFingerprint(raw), fingerprint);
    assert.notEqual(
      await nativeLaunchUrlFingerprint(`${raw}different`),
      fingerprint
    );
    assert.ok(!fingerprint.includes('one-time-email-token'));
  });

  test('fingerprints work without HTTPS-only SubtleCrypto', async (t) => {
    t.mock.method(globalThis.crypto.subtle, 'digest', () => {
      throw new Error('SubtleCrypto is unavailable in HTTP LAN previews');
    });
    assert.equal(
      await nativeLaunchUrlFingerprint('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('native deep-link boundaries', () => {
  test('accepts both production surfaces and the current development origin', () => {
    for (const url of [
      `${origin}/p/taylor?tab=about#work`,
      'https://social.panamia.club/s',
      'https://www.panamia.club/signin',
      'http://192.168.1.50:3001/signin',
    ]) {
      const appOrigin = 'http://192.168.1.50:3001';
      assert.equal(nativeDeepLinkUrl(url, appOrigin)?.href, url);
    }
  });

  test('rejects foreign, insecure, credential-bearing, and malformed URLs', () => {
    for (const url of [
      'https://evil.example/',
      'https://panamia.club.evil.example/',
      'http://social.panamia.club/',
      'https://panamia.club:444/',
      'https://member@panamia.club/',
      'javascript:alert(1)',
      '//panamia.club/',
      '/signin',
      'not a URL',
    ]) {
      assert.equal(nativeDeepLinkUrl(url, origin), null, url);
    }
  });

  test('the auth scheme cannot carry an arbitrary navigation or verification URL', () => {
    const app = `${MOBILE_APP_ID}://auth/magic-link?`;
    for (const target of [
      `https://evil.example${MOBILE_MAGIC_LINK_PATH}?token=a`,
      `${origin}/account?token=a`,
      verificationUrl(),
      `${origin}${MOBILE_MAGIC_LINK_PATH}?token=a&token=b`,
    ]) {
      assert.equal(
        nativeDeepLinkUrl(
          `${app}${new URLSearchParams({ url: target })}`,
          origin
        ),
        null
      );
    }
    const valid = mobileMagicLinkAppUrl(mobileMagicLinkUrl(verificationUrl()));
    for (const invalid of [
      valid.replace('://auth/', '://other/'),
      valid.replace('/magic-link?', '/other?'),
      `${valid}&url=${encodeURIComponent(mobileMagicLinkUrl(verificationUrl()))}`,
      `${valid}#fragment`,
    ]) {
      assert.equal(nativeDeepLinkUrl(invalid, origin), null);
    }
  });

  test('native Google callback validation never accepts an external origin', () => {
    assert.equal(
      isAppUrl(new URL('https://social.panamia.club/s'), origin),
      true
    );
    assert.equal(isAppUrl(new URL('https://evil.example/'), origin), false);
    assert.equal(isAppUrl(new URL('javascript:alert(1)'), origin), false);
  });
});

test('native Google is available only in Android builds that include the plugin', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  for (const [platform, native, plugin, expected] of [
    ['android', true, true, true],
    ['android', true, false, false],
    ['ios', true, true, false],
    ['web', false, true, false],
  ] as const) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        Capacitor: {
          isNativePlatform: () => native,
          getPlatform: () => platform,
          isPluginAvailable: (name: string) => plugin && name === 'SocialLogin',
        },
      },
    });
    assert.equal(hasNativeGoogleSignIn(), expected);
  }
});
