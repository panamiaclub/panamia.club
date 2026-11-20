import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHttpsRedirect } from '@/lib/server/https-redirect';

test('production HTTP redirects preserve donation and contact destinations', () => {
  for (const host of [
    'panamia.club',
    'info.panamia.club',
    'social.panamia.club',
  ]) {
    const url = new URL(
      `http://${host}/support-pana?canceled=1&frequency=monthly&amount=1500`
    );
    assert.equal(
      getHttpsRedirect(url, 'panamia.club'),
      `https://${host}/support-pana?canceled=1&frequency=monthly&amount=1500`
    );
    assert.equal(url.protocol, 'http:');
  }
});

test('HTTPS does not loop and unrelated hosts are not redirected', () => {
  for (const address of [
    'https://panamia.club/support-pana',
    'http://preview.workers.dev/',
    'http://notpanamia.club/',
    'http://panamia.club.example.com/',
  ]) {
    assert.equal(getHttpsRedirect(new URL(address), 'panamia.club'), null);
  }
});

test('local HTTP previews remain usable even with a local root domain', () => {
  for (const host of ['localhost', 'social.localhost', '127.0.0.1', '[::1]']) {
    assert.equal(
      getHttpsRedirect(new URL(`http://${host}:3107/mock/home`), host),
      null
    );
  }
});
