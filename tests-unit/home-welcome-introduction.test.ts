import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';
import { appRouterInstance } from 'vinext/shims/navigation';

import { HomePage } from '../components/home/home-page';
import { HomeMock } from '../app/mock/home/_components/home-mock';
import enCommon from '../locales/en/common.json';
import esCommon from '../locales/es/common.json';
import enHome from '../locales/en/home.json';
import esHome from '../locales/es/home.json';

const APPROVED_INTRODUCTION =
  'Pana MIA Club is South Florida\u2019s first hyper-local connection platform built by and for the community. We are here for the creatives, small business owners, culture keepers, and everyone in between, all for a future that is local, a future for the people.';

async function renderHome(
  component: typeof HomePage,
  language: 'en' | 'es'
): Promise<string> {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { home: enHome, common: enCommon },
      es: { home: esHome, common: esCommon },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  assert.ok(AppRouterContext);
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: appRouterInstance },
      createElement(I18nextProvider, { i18n }, createElement(component))
    )
  );
}

for (const { name, component } of [
  { name: 'live homepage', component: HomePage },
  { name: 'homepage mock', component: HomeMock },
]) {
  for (const language of ['en', 'es'] as const) {
    test(`${name} keeps the approved welcome introduction intact in ${language}`, async () => {
      const html = await renderHome(component, language);
      const heading = html.match(
        /<div class="home-sectionhead"[^>]*>([\s\S]*?)<\/div>/
      )?.[1];
      assert.ok(heading);

      const paragraphs = heading.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [];
      assert.equal(paragraphs.length, 1);
      const paragraph = paragraphs[0];
      assert.equal(paragraph.replace(/<[^>]*>/g, ''), APPROVED_INTRODUCTION);
      assert.match(paragraph, /<p\b[^>]*class="[^"]*\btext-center\b[^"]*"/);
      assert.match(paragraph, /<strong>[\s\S]*<\/strong><\/p>/);
      assert.match(paragraph, /<em>for the community<\/em>/);
      assert.match(paragraph, /<em>for the people<\/em>/);
      assert.equal((paragraph.match(/<em>/g) ?? []).length, 2);
      assert.doesNotMatch(paragraph, /<br\b/);
      assert.ok(heading.indexOf('</h2>') < heading.indexOf('<p '));
      assert.equal((html.match(/class="beat-sign"/g) ?? []).length, 4);
      assert.equal((html.match(/class="beat-toggle"/g) ?? []).length, 4);
    });
  }
}
