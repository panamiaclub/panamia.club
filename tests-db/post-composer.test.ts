import { after, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let groups = [
  {
    id: 'room',
    handle: 'room',
    name: 'Our room',
    visibility: 'private',
    memberCount: 5,
  },
];

mock.module(import.meta.resolve('../lib/query/social.ts'), {
  namedExports: {
    useMyActor: () => ({
      data: { actor: { name: 'Fixture Pana', username: 'fixture' } },
    }),
    useMyGroups: () => ({ data: { groups } }),
    useCreatePost: () => ({ isPending: false }),
    useCreateGroupPost: () => ({ isPending: false }),
  },
});
mock.module(import.meta.resolve('../hooks/use-module-consent.ts'), {
  namedExports: {
    useModuleConsent: () => ({
      needsConsent: false,
      recordConsent: async () => {},
    }),
  },
});
mock.module(import.meta.resolve('react-i18next'), {
  namedExports: {
    useTranslation: () => ({ t: (key: string) => key }),
  },
});

const { PostComposer } = await import('../components/social/PostComposer');
const { MediaAttachments } = await import('../components/MultiMediaUpload');
after(() => mock.restoreAll());

it('starts compact with identity, visible media actions, and a public audience', () => {
  const html = renderToStaticMarkup(createElement(PostComposer));
  assert.match(html, /Fixture Pana/);
  assert.match(html, /aria-label="Audience: Everyone"/);
  assert.match(html, /aria-label="Add photos or video"/);
  assert.match(html, /aria-label="Add audio"/);
  assert.match(html, /data-expanded="false"/);
  assert.match(html, /rows="1"/);
  assert.doesNotMatch(html, /aria-label="More post options"/);
  assert.match(html, /Anyone can read this/);
  assert.match(html, /type="submit"[^>]*disabled=""/);
  assert.doesNotMatch(html, /Local Panas|Your groups|CC BY|cheatsheet/);
});

it('keeps replies compact, with no audience control or duplicate identity row', () => {
  const html = renderToStaticMarkup(
    createElement(PostComposer, {
      inReplyTo: 'parent',
      replyVisibility: 'private',
    })
  );
  assert.match(html, /aria-label="Reply composer"/);
  assert.match(html, />Reply<\/button>/);
  assert.match(html, /class="flex flex-wrap items-center gap-2"/);
  assert.match(html, /class="(?=[^"]*\bborder-t\b)(?=[^"]*\bflex-wrap\b)/);
  assert.doesNotMatch(html, /Audience:|Fixture Pana|rounded-3xl/);
});

it('pins compact group posting without describing it as a personal public post', () => {
  const html = renderToStaticMarkup(
    createElement(PostComposer, { lockedGroupHandle: 'room' })
  );
  assert.match(html, /Our room/);
  assert.match(html, /Only the 5 members of Our room can see this/);
  assert.doesNotMatch(html, /Audience:|Anyone can read this/);
});

it('does not claim public reach while a pinned group is still loading', () => {
  const saved = groups;
  groups = [];
  try {
    const html = renderToStaticMarkup(
      createElement(PostComposer, { lockedGroupHandle: 'room' })
    );
    assert.match(html, /Posting to this group/);
    assert.doesNotMatch(html, /Everyone|Anyone can read this/);
  } finally {
    groups = saved;
  }
});

it('renders native inline video/audio controls and named, always-visible removal actions', () => {
  const html = renderToStaticMarkup(
    createElement(MediaAttachments, {
      value: [
        {
          type: 'video',
          mediaType: 'video/mp4',
          url: '/movie.mp4',
          name: 'A video',
        },
        {
          type: 'audio',
          mediaType: 'audio/ogg',
          url: '/voice.ogg',
          name: 'A voice note',
        },
      ],
      onRemove: () => {},
    })
  );
  assert.match(html, /<video[^>]*controls=""/);
  assert.match(html, /<audio[^>]*controls=""/);
  assert.match(html, /aria-label="Remove A video"/);
  assert.match(html, /aria-label="Remove A voice note"/);
  assert.doesNotMatch(html, /opacity-0|group-hover/);
});

it('formatting previews cannot remove attachments', () => {
  const html = renderToStaticMarkup(
    createElement(MediaAttachments, {
      value: [
        {
          type: 'image',
          mediaType: 'image/png',
          url: '/photo.png',
          name: 'A photo',
        },
      ],
    })
  );
  assert.match(html, /alt="A photo"/);
  assert.doesNotMatch(html, /<button/);
});
