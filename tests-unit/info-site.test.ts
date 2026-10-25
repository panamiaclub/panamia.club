import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SURFACE,
  getSurface,
  originForFrom,
  resolveSurface,
  surfaceForPath,
} from '@/lib/panaverse/surfaces';
import {
  resolveChromeSurface,
  wearsGuestChrome,
  wearsOwnChrome,
  wearsSurfaceChrome,
} from '@/lib/panaverse/chrome';
import {
  INFO_LINKS,
  getInfoCanonicalUrl,
  getInfoMetadata,
} from '@/lib/info-site';
import en from '@/locales/en/info.json';
import es from '@/locales/es/info.json';
import nextConfig from '@/next.config.js';

const envKeys = [
  'PANAVERSE_ROOT_DOMAIN',
  'PANAVERSE_SUBDOMAINS',
  'FEDERATION_DOMAIN',
] as const;
const previous = new Map(envKeys.map((key) => [key, process.env[key]]));

before(() => {
  process.env.PANAVERSE_ROOT_DOMAIN = 'panamia.club';
  process.env.PANAVERSE_SUBDOMAINS = '1';
  process.env.FEDERATION_DOMAIN = 'pana.social';
});

after(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('info site routing', () => {
  test('recognizes the production and local info hostnames', () => {
    for (const host of [
      'info.panamia.club',
      'INFO.PANAMIA.CLUB:443',
      'info.localhost:3000',
    ]) {
      assert.equal(resolveSurface(host).id, 'info', host);
    }
    assert.equal(surfaceForPath('/info').id, 'info');
    assert.equal(surfaceForPath('/info/').id, 'info');
  });

  test('leaves the apex, aliases, other surfaces, and unknown hosts unchanged', () => {
    for (const host of [
      'panamia.club',
      'www.panamia.club',
      'preview.workers.dev',
      'info.panamia.club.example.com',
      'other.info.panamia.club',
    ]) {
      assert.equal(resolveSurface(host).id, 'www', host);
    }
    assert.equal(resolveSurface('social.panamia.club').id, 'social');
    assert.equal(resolveSurface('pana.social').id, 'social');
    assert.equal(resolveChromeSurface(DEFAULT_SURFACE, '/').id, 'www');
  });

  test('uses the staged canonical until the info hostname is marked ready', () => {
    const info = getSurface('info');
    const canonical = info.subdomainPending
      ? 'https://panamia.club/info'
      : 'https://info.panamia.club/';
    assert.equal(
      originForFrom(info, 'panamia.club'),
      info.subdomainPending
        ? 'https://panamia.club'
        : 'https://info.panamia.club'
    );
    assert.equal(
      originForFrom(info, 'info.localhost:3000'),
      'http://info.localhost:3000'
    );
    assert.equal(getInfoCanonicalUrl(), canonical);
    assert.deepEqual(getInfoMetadata().alternates, {
      canonical,
    });
  });
});

describe('info site chrome', () => {
  test('uses exactly the page-owned chrome on its path and hostname root', () => {
    const info = getSurface('info');
    for (const pathname of ['/', '/info', '/info/']) {
      assert.equal(wearsOwnChrome(pathname, info), true);
      assert.equal(wearsGuestChrome(info, pathname), false);
      assert.equal(wearsSurfaceChrome(info, pathname), false);
    }
    assert.equal(wearsOwnChrome('/'), false);
    assert.equal(wearsOwnChrome('/', DEFAULT_SURFACE), false);
    assert.equal(wearsOwnChrome('/signin'), true);
    assert.equal(wearsSurfaceChrome(getSurface('social'), '/'), true);
    assert.equal(wearsGuestChrome(info, '/d'), true);
    assert.equal(wearsOwnChrome('/d', info), false);
  });

  test('recognizes the standalone page on the shared apex too', () => {
    const chrome = resolveChromeSurface(DEFAULT_SURFACE, '/info');
    assert.equal(chrome.id, 'info');
    assert.equal(wearsOwnChrome('/info', chrome), true);
  });
});

describe('info site content', () => {
  test('links to current app routes rather than the legacy funnels', () => {
    assert.deepEqual(INFO_LINKS, [
      { id: 'directory', href: '/d' },
      { id: 'social', href: '/s' },
      { id: 'events', href: '/e' },
      { id: 'connectors', href: '/connectors' },
      { id: 'listing', href: '/form/get-listed' },
      { id: 'support', href: '/donate' },
    ]);
  });

  test('has the same translation keys in English and Spanish', () => {
    function keys(value: unknown, prefix = ''): string[] {
      if (typeof value !== 'object' || value === null) return [prefix];
      return Object.entries(value).flatMap(([key, child]) =>
        keys(child, `${prefix}.${key}`)
      );
    }
    assert.deepEqual(keys(en).sort(), keys(es).sort());
  });

  test('preserves the old newsletter signup URL with a permanent redirect', async () => {
    assert.ok(nextConfig.redirects);
    const redirects = await nextConfig.redirects();
    assert.deepEqual(
      redirects.find((entry) => entry.source === '/newsletter-sign-up-702983'),
      {
        source: '/newsletter-sign-up-702983',
        destination: '/info#newsletter-signup',
        permanent: true,
      }
    );
  });
});
