import { after, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let publicPosts = [{ id: 'public-post' }];
let publicError = false;

mock.module(import.meta.resolve('../lib/auth-client.ts'), {
  namedExports: {
    useSession: () => ({ status: 'authenticated' }),
  },
});
mock.module(import.meta.resolve('next/navigation'), {
  namedExports: {
    redirect: (url: string) => {
      throw new Error(`Unexpected redirect: ${url}`);
    },
  },
});
mock.module(import.meta.resolve('next/dynamic'), {
  defaultExport: () => () => null,
});
mock.module(import.meta.resolve('../components/social/index.ts'), {
  namedExports: {
    SocialEligibilityGate: ({ children }: { children: ReactNode }) => children,
  },
});
mock.module(import.meta.resolve('../components/panaverse/SurfaceLink.tsx'), {
  defaultExport: ({ children, ...props }: ComponentProps<'a'>) =>
    createElement('a', props, children),
});
mock.module(import.meta.resolve('../lib/query/social.ts'), {
  namedExports: {
    useMyActor: () => ({ data: { actor: null } }),
    useTimeline: () => ({
      data: { statuses: [{ id: 'panas-post' }] },
      isLoading: false,
      isError: false,
    }),
    usePublicTimeline: () => ({
      data: { statuses: publicPosts },
      isLoading: false,
      isError: publicError,
    }),
  },
});
mock.module(import.meta.resolve('../app/s/_components/feed-post-card.tsx'), {
  namedExports: {
    FeedPostCard: ({ status }: { status: { id: string } }) =>
      createElement('article', { 'data-post-id': status.id }, status.id),
  },
});
mock.module(import.meta.resolve('../app/s/_components/feed-modules.tsx'), {
  namedExports: {
    DirectoryModule: () => null,
    EventsModule: () => null,
    SuggestionsModule: () => null,
  },
});
for (const [path, name] of [
  ['../app/s/_components/feed-rail.tsx', 'FeedRail'],
  ['../app/s/_components/stories-rail.tsx', 'StoriesRail'],
  ['../app/s/_components/identity-prompt.tsx', 'IdentityPrompt'],
] as const) {
  mock.module(import.meta.resolve(path), {
    namedExports: { [name]: () => null },
  });
}

const { FeedPage } = await import('../app/s/_components/feed-page');
after(() => mock.restoreAll());

it('opens Everyone first and keeps Panas available as an unselected tab', () => {
  const html = renderToStaticMarkup(createElement(FeedPage));
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(
    (match) => match[0]
  );

  assert.equal(tabs.length, 3);
  assert.match(tabs[0], /id="feed-tab-everyone"/);
  assert.match(tabs[0], /aria-selected="true"/);
  assert.match(tabs[1], /id="feed-tab-panas"/);
  assert.match(tabs[1], /aria-selected="false"/);
  assert.match(html, /aria-labelledby="feed-tab-everyone"/);
  assert.match(html, /data-post-id="public-post"/);
  assert.doesNotMatch(html, /data-post-id="panas-post"/);
});

it('an empty default feed explains the absence of public posts', () => {
  publicPosts = [];
  try {
    const html = renderToStaticMarkup(createElement(FeedPage));
    assert.match(html, /No public posts yet/);
    assert.doesNotMatch(html, /Your Panas feed starts here/);
  } finally {
    publicPosts = [{ id: 'public-post' }];
  }
});

it('a failure in Everyone is not hidden by a populated Panas feed', () => {
  publicError = true;
  try {
    const html = renderToStaticMarkup(createElement(FeedPage));
    assert.match(html, /Something went wrong fetching the timeline/);
    assert.doesNotMatch(html, /data-post-id="panas-post"/);
    assert.doesNotMatch(html, /No public posts yet/);
  } finally {
    publicError = false;
  }
});
