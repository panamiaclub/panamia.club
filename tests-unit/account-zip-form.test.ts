import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { ZipCodeForm } from '../app/welcome/zip/zip-code-form';
import en from '../locales/en/common.json';
import es from '../locales/es/common.json';

for (const lng of ['en', 'es'] as const) {
  test(`ZIP setup requires a US ZIP and offers account/privacy exits rather than a skip (${lng})`, async () => {
    const i18n = createInstance();
    await i18n.init({
      lng,
      resources: { en: { common: en }, es: { common: es } },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    const html = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(ZipCodeForm, { destination: '/s' })
      )
    );
    const input = html.match(/<input\b[^>]*>/)?.[0];
    assert.ok(input);
    assert.match(input, /required=""/);
    assert.match(input, /autoComplete="postal-code"/);
    assert.match(
      input,
      /aria-describedby="account-zip-hint account-zip-privacy account-zip-error"/
    );
    assert.ok(html.includes('id="account-zip-privacy"'));
    assert.ok(
      html.includes(
        renderToStaticMarkup(
          i18n.t('onboarding.zipPrivacyNote', { ns: 'common' })
        )
      )
    );
    const pattern = input.match(/pattern="([^"]+)"/)?.[1];
    assert.ok(pattern);
    const accepted = new RegExp(`^(?:${pattern})$`);
    for (const value of ['00501', '33138-1234']) {
      assert.equal(accepted.test(value), true, value);
    }
    for (const value of ['', '3313', '331380', 'M5V 1A1', '33138-123']) {
      assert.equal(accepted.test(value), false, value);
    }
    assert.match(html, /href="\/legal\/privacy"/);
    assert.match(html, /href="\/account\/user\/edit"/);
    assert.ok(html.includes(i18n.t('onboarding.zipSignOut', { ns: 'common' })));
    assert.ok(!html.includes(i18n.t('onboarding.skip', { ns: 'common' })));
    assert.doesNotMatch(html, /onboarding\.zip/);
  });
}
