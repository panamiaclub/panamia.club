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
const { AttachmentGrid } = await import('../components/social/AttachmentGrid');
after(() => mock.restoreAll());

it('starts compact with identity, visible media actions, and a public audience', () => {
  const html = renderToStaticMarkup(createElement(PostComposer));
  assert.match(html, /Fixture Pana/);
  assert.match(html, /aria-label="Audience: Everyone"/);
  assert.match(html, /aria-label="Add photos or video"/);
  assert.doesNotMatch(html, /Add audio|Choose audio|audio\/\*|<audio/);
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

it('keeps inline video and removal controls while hiding retired audio from drafts', () => {
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
  assert.doesNotMatch(html, /<audio|voice\.ogg|A voice note/);
  assert.match(html, /aria-label="Remove A video"/);
  assert.doesNotMatch(html, /opacity-0|group-hover/);
});

it('hides stored recordings and waveforms without removing photos or video', () => {
  const attachments = [
    {
      id: 'legacy-audio',
      type: 'audio',
      mediaType: 'audio/ogg',
      url: '/legacy-voice.ogg',
      name: 'Old recording',
      peaks: [0.2, 0.8],
    },
    {
      id: 'misclassified-audio',
      type: 'video',
      mediaType: 'AUDIO/WEBM',
      url: '/legacy-voice.webm',
    },
    {
      id: 'photo',
      type: 'image',
      mediaType: 'image/png',
      url: '/photo.png',
      name: 'A photo',
    },
    {
      id: 'video',
      type: 'video',
      mediaType: 'video/mp4',
      url: '/movie.mp4',
      name: 'A video',
    },
  ];
  const saved = structuredClone(attachments);
  const html = renderToStaticMarkup(
    createElement(AttachmentGrid, { attachments })
  );
  assert.match(html, /alt="A photo"/);
  assert.match(html, /<video[^>]*controls=""/);
  assert.match(html, /type="video\/mp4"/);
  assert.doesNotMatch(html, /<audio|legacy-voice|Old recording|<svg/);
  assert.deepEqual(attachments, saved);
});

it('leaves a neutral notice for audio-only history without exposing a recording URL', () => {
  const html = renderToStaticMarkup(
    createElement(AttachmentGrid, {
      attachments: [
        {
          id: 'old-recording',
          type: 'audio',
          url: '/legacy-voice.ogg',
          peaks: [0.2, 0.8],
        },
      ],
    })
  );
  assert.match(html, /Attachment unavailable/);
  assert.doesNotMatch(html, /<audio|<video|<svg|legacy-voice/);
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
