import { after, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let feedPosts = [{ id: 'pana-post' }, { id: 'community-post' }];
let feedError = false;
let more = false;
let native = false;

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
mock.module(import.meta.resolve('../lib/mobile/use-native-app.ts'), {
  namedExports: { useIsNativeApp: () => native },
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
      data: { pages: [{ statuses: feedPosts }] },
      isPending: false,
      isError: feedError,
      hasNextPage: more,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
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

it('uses one mixed feed without reading tabs or a replacement filter row on web and native', () => {
  try {
    for (const isNative of [false, true]) {
      native = isNative;
      const html = renderToStaticMarkup(createElement(FeedPage));
      assert.match(html, /<section[^>]*aria-label="Community feed"/);
      assert.match(html, /data-post-id="pana-post"/);
      assert.match(html, /data-post-id="community-post"/);
      assert.doesNotMatch(
        html,
        /role="tab"|role="tabpanel"|Feed filters|native-feed-filters|feed-tab-/
      );
    }
  } finally {
    native = false;
  }
});

it('an empty mixed feed does not require mutual connections before getting started', () => {
  const saved = feedPosts;
  feedPosts = [];
  try {
    const html = renderToStaticMarkup(createElement(FeedPage));
    assert.match(html, /Your community feed starts here/);
    assert.match(html, /Share a moment with Everyone/);
    assert.doesNotMatch(html, /Your Panas feed starts here/);
  } finally {
    feedPosts = saved;
  }
});

it('a failed refresh is visible without discarding already loaded posts', () => {
  feedError = true;
  try {
    const html = renderToStaticMarkup(createElement(FeedPage));
    assert.match(html, /Could not refresh the feed/);
    assert.match(html, /data-post-id="pana-post"/);
    assert.match(html, /data-post-id="community-post"/);
    assert.doesNotMatch(html, /all caught up|No posts yet/);
  } finally {
    feedError = false;
  }
});

it('offers the next page instead of falsely announcing the feed is caught up', () => {
  more = true;
  try {
    const html = renderToStaticMarkup(createElement(FeedPage));
    assert.match(html, /Load more posts/);
    assert.doesNotMatch(html, /all caught up/);
  } finally {
    more = false;
  }
});

it('renders a post only once when pages overlap after a feed refresh', () => {
  const saved = feedPosts;
  feedPosts = [{ id: 'pana-post' }, { id: 'pana-post' }];
  try {
    const html = renderToStaticMarkup(createElement(FeedPage));
    assert.equal([...html.matchAll(/data-post-id="pana-post"/g)].length, 1);
  } finally {
    feedPosts = saved;
  }
});
