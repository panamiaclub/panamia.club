import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';
import { appRouterInstance } from 'vinext/shims/navigation';

import { ProfileHero } from '@/app/p/[user]/_components/profile-hero';
import { ProfileViewer } from '@/app/p/[user]/_components/profile-viewer';
import { MentoringSection } from '@/app/p/[user]/_components/mentoring-section';
import type { ProfileView } from '@/app/p/[user]/_lib/profile-view';

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { profile: {} } },
});

const profile: ProfileView = {
  id: 'pending-business',
  handle: 'pending-shop',
  name: 'Ana Bakery',
  tagline: 'Fresh bread and pastries',
  bio: 'A local bakery awaiting review.',
  logo: null,
  coverImage: null,
  city: 'Miami',
  region: 'FL',
  coords: null,
  onlineOnly: false,
  certified: false,
  categories: [],
  links: [],
  gallery: [],
};

function render(element: ReactElement): string {
  assert.ok(AppRouterContext);
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(
        AppRouterContext.Provider,
        { value: appRouterInstance },
        element
      )
    )
  );
}

function renderHero(preview?: boolean): string {
  return render(
    createElement(ProfileViewer, {
      profileId: profile.id,
      businessName: profile.name,
      businessLogo: profile.logo,
      initialSaves: 3,
      initialRecommends: 1,
      preview,
      children: createElement(ProfileHero, {
        profile,
        recommenderAvatars: [],
        preview,
      }),
    })
  );
}

test('admin previews render the listing identity and counts without public action buttons', () => {
  const html = renderHero(true);
  assert.match(html, /<h1\b[^>]*>Ana Bakery<\/h1>/);
  assert.match(html, /Fresh bread and pastries/);
  assert.match(html, /Miami/);
  assert.match(html, /bizprofile-stat-figure">3<\/span>/);
  assert.doesNotMatch(html, /<button\b/);
  assert.doesNotMatch(html, /href="\/welcome"/);
});

test('public profiles retain save, recommend, and share controls by default', () => {
  const html = renderHero();
  assert.equal((html.match(/<button\b/g) ?? []).length, 3);
  assert.match(html, /hero\.save/);
  assert.match(html, /hero\.recommend/);
  assert.match(html, /hero\.share/);
});

test('mentoring previews retain profile information without booking controls', () => {
  const html = render(
    createElement(MentoringSection, {
      handle: profile.handle,
      preview: true,
      mentoring: {
        bio: 'Learn how to start a bakery.',
        expertise: ['Baking'],
        languages: ['English'],
      },
    })
  );
  assert.match(html, /Learn how to start a bakery/);
  assert.match(html, /Baking/);
  assert.match(html, /English/);
  assert.doesNotMatch(html, /<button\b/);
});
