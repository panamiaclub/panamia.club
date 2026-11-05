import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';
import { appRouterInstance } from 'vinext/shims/navigation';
import { SendMessageButton } from '@/components/social/SendMessageButton';
import type { GroupChatConversation } from '@/lib/chat';
import {
  directMessageHref,
  inboxKey,
  inboxSelection,
  mergeInboxEntries,
  type DirectInboxEntry,
} from '@/app/messages/_lib/inbox';

const actor = {
  id: 'garden',
  username: 'ana',
  domain: 'example.invalid',
  name: 'Ana',
};
const direct: DirectInboxEntry = {
  kind: 'direct',
  actor,
  lastMessage: null,
};
const group: GroupChatConversation = {
  id: 'group-garden',
  actorId: 'group-actor',
  handle: 'garden',
  name: 'Garden Crew',
  iconUrl: null,
  memberCount: 3,
  visibility: 'private',
  role: 'member',
  lastMessage: null,
};
const message = (id: string, published: string) => ({
  id,
  uri: `https://example.invalid/statuses/${id}`,
  actor: { ...actor, followingCount: 0, followersCount: 0, statusCount: 0 },
  content: '<p>Hello.</p>',
  published,
  expiresAt: '2026-12-01T10:00:00.000Z',
  repliesCount: 0,
  likesCount: 0,
  liked: false,
});

describe('one messages inbox', () => {
  it('orders individual and group conversations together by newest message', () => {
    const person = {
      ...direct,
      lastMessage: message('direct-last', '2026-11-04T10:00:00.000Z'),
    };
    const room: GroupChatConversation = {
      ...group,
      lastMessage: {
        ...message('group-last', '2026-11-04T11:00:00.000Z'),
        groupId: group.id,
        clientId: null,
        canDelete: false,
      },
    };
    const entries = mergeInboxEntries([person], [room]);
    assert.deepEqual(
      entries.map((entry) => entry.kind),
      ['group', 'direct']
    );
    assert.deepEqual(inboxSelection(entries[0]), {
      kind: 'group',
      id: 'garden',
    });
  });

  it('does not confuse a group handle with an individual actor ID', () => {
    assert.equal(inboxKey(inboxSelection(direct)), 'direct:garden');
    assert.equal(
      inboxKey(inboxSelection({ kind: 'group', group })),
      'group:garden'
    );
    assert.equal(mergeInboxEntries([direct], [group]).length, 2);
  });

  it('keeps empty conversations after active ones without mutating either input', () => {
    const active = {
      ...direct,
      actor: { ...actor, id: 'active' },
      lastMessage: message('latest', '2026-11-04T10:00:00.000Z'),
    };
    const people = [direct, active];
    const rooms = [group];
    const entries = mergeInboxEntries(people, rooms);
    assert.equal(entries[0], active);
    assert.deepEqual(people, [direct, active]);
    assert.deepEqual(rooms, [group]);
    assert.equal(entries.length, 3);
  });

  it('uses the request timestamp when its retained messages have expired', () => {
    const request = { ...direct, requestedAt: '2026-11-04T12:00:00.000Z' };
    assert.equal(mergeInboxEntries([request], [group])[0], request);
  });

  it('keeps a newly started profile chat easy to find before its first send', () => {
    const started = {
      ...direct,
      actor: { ...actor, id: 'new-person' },
      startedAt: '2026-11-04T12:00:00.000Z',
    };
    const previous = {
      ...direct,
      lastMessage: message('earlier', '2026-11-04T11:00:00.000Z'),
    };
    assert.equal(mergeInboxEntries([previous, started], [group])[0], started);
  });

  it('breaks equal-activity ties deterministically across both sources', () => {
    const another = { ...direct, actor: { ...actor, id: 'another' } };
    const a = mergeInboxEntries([direct, another], [group]).map(inboxSelection);
    const b = mergeInboxEntries([another, direct], [group]).map(inboxSelection);
    assert.deepEqual(a, b);
  });

  it('keeps the production inbox accessible without restoring removed controls', () => {
    const list = readFileSync(
      new URL(
        '../app/messages/_components/conversation-list.tsx',
        import.meta.url
      ),
      'utf8'
    );
    const folders = readFileSync(
      new URL(
        '../app/messages/_components/message-folders.tsx',
        import.meta.url
      ),
      'utf8'
    );
    assert.match(list, /<h1 className="sr-only">Messages<\/h1>/);
    assert.doesNotMatch(
      list,
      /A little closer|Good conversations start here|<input|New message<\/button>/
    );
    assert.doesNotMatch(folders, /'groups'|>\s*Groups\s*</);
    assert.match(folders, /Requests/);
  });
});

describe('starting a conversation from a profile', () => {
  it('encodes the selected actor as data, not another URL or query', () => {
    const href = directMessageHref('actor?next=/admin&group=private');
    const target = new URL(href, 'https://example.invalid');
    assert.equal(target.pathname, '/messages');
    assert.equal(
      target.searchParams.get('to'),
      'actor?next=/admin&group=private'
    );
    assert.deepEqual([...target.searchParams.keys()], ['to']);
  });

  for (const [language, label, openLabel] of [
    ['en', 'Message', 'Message Ana'],
    ['es', 'Mensaje', 'Enviar un mensaje a Ana'],
  ]) {
    it(`renders the real localized profile Message link in ${language}`, async () => {
      const i18n = createInstance();
      await i18n.init({
        lng: language,
        resources: {
          [language]: {
            profile: JSON.parse(
              readFileSync(
                new URL(`../locales/${language}/profile.json`, import.meta.url),
                'utf8'
              )
            ),
          },
        },
      });
      assert.ok(AppRouterContext);
      const html = renderToStaticMarkup(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(
            AppRouterContext.Provider,
            { value: appRouterInstance },
            createElement(SendMessageButton, { actorId: actor.id, name: 'Ana' })
          )
        )
      );
      assert.match(html, /href="\/messages\?to=garden"/);
      assert.ok(html.includes(`aria-label="${openLabel}"`));
      assert.ok(html.includes(label));
      assert.match(html, /min-h-11/);
    });
  }
});
