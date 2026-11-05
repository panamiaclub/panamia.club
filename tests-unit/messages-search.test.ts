/**
 * Tests for the Messages search box.
 *
 * The box shipped as a div wrapping a span: a pill with a magnifier and
 * placeholder-grey label reading "Search messages", promoted verbatim from
 * the mock it was designed in. It had the exact silhouette of a search field
 * and could not be focused or typed into, so the only way to discover it was
 * decorative was to try to use it -- which is how it was reported, as "the
 * send messages text box isnt working".
 *
 * Two things are guarded here.
 *
 * The behaviour, as pure functions, because the box answers two questions at
 * once -- which of my threads is this, and who else could I write to -- and
 * the exclusions in the second are the part that silently rots. A row
 * offering a conversation with yourself looks perfectly reasonable in review
 * and dead-ends on a 404 the moment anyone clicks it.
 *
 * The retained mock's markup, at source level, because no pure test can tell an <input> from
 * a <span> that looks like one, and that distinction was the entire bug.
 * The production inbox intentionally no longer offers search or a compose button.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  actorMatchesTerm,
  filterConversations,
  newConversationCandidates,
  normalizeSearchTerm,
} from '../app/messages/_lib/search';

const maria = { id: 'a1', username: 'mgonzalez', name: 'Maria Gonzalez' };
const luis = { id: 'a2', username: 'luisito', name: 'Luis Perez' };
const viewer = { id: 'me', username: 'jose', name: 'Jose' };

const thread = (actor: { id: string; username: string; name: string }) => ({
  actor,
});

describe('normalizeSearchTerm', () => {
  test('folds case and surrounding space', () => {
    assert.equal(normalizeSearchTerm('  MaRia '), 'maria');
  });

  test('strips a leading @, which is typed but never stored', () => {
    assert.equal(normalizeSearchTerm('@mgonzalez'), 'mgonzalez');
    assert.equal(normalizeSearchTerm('@@mgonzalez'), 'mgonzalez');
  });

  test('leaves an interior @ alone, so a full handle still matches', () => {
    assert.equal(
      normalizeSearchTerm('@maria@otherhost'),
      'maria@otherhost',
      'only the sigil is decoration; the domain is part of the identity'
    );
  });

  test('an empty box is an empty term', () => {
    assert.equal(normalizeSearchTerm('   '), '');
  });
});

describe('actorMatchesTerm', () => {
  test('matches the handle', () => {
    assert.ok(actorMatchesTerm(maria, 'gonz'));
  });

  test('matches the display name', () => {
    /* The reason the actor-search endpoint had to change too. Members look
       for each other by name, and a handle often contains no part of one --
       searching "maria" for @mgonzalez found nothing at all before. */
    assert.ok(actorMatchesTerm(maria, 'maria'));
  });

  test('an empty term matches everyone, so an empty box filters nothing', () => {
    assert.ok(actorMatchesTerm(maria, ''));
  });

  test('survives an actor with no display name', () => {
    assert.ok(actorMatchesTerm({ id: 'x', username: 'solo' }, 'sol'));
    assert.ok(
      !actorMatchesTerm({ id: 'x', username: 'solo', name: null }, 'q')
    );
  });

  test('does not match an unrelated term', () => {
    assert.ok(!actorMatchesTerm(maria, 'luis'));
  });
});

describe('filterConversations', () => {
  const entries = [thread(maria), thread(luis)];

  test('keeps only the threads whose counterparty answers', () => {
    assert.deepEqual(filterConversations(entries, 'luis'), [thread(luis)]);
  });

  test('returns the list untouched for an empty term', () => {
    assert.equal(
      filterConversations(entries, ''),
      entries,
      'an unfiltered list should be the same array, not a copy'
    );
  });

  test('can return nothing', () => {
    assert.deepEqual(filterConversations(entries, 'zzz'), []);
  });
});

describe('newConversationCandidates', () => {
  test('drops the viewer', () => {
    /* The conversation endpoint compares viewerActorId to the counterparty
       and answers 404 before it looks anything up, so a row offering to
       message yourself opens nothing and reports nothing. The search
       endpoint returns you on purpose -- voice memos may be sent to
       yourself -- so this exclusion is the caller's to make. */
    const found = newConversationCandidates([viewer, maria], {
      existing: [],
      viewerActorId: 'me',
    });

    assert.deepEqual(
      found.map((a) => a.id),
      ['a1']
    );
  });

  test('drops people already in the list above', () => {
    const found = newConversationCandidates([maria, luis], {
      existing: [thread(maria)],
      viewerActorId: 'me',
    });

    assert.deepEqual(
      found.map((a) => a.id),
      ['a2'],
      'the same person must not appear twice in one panel'
    );
  });

  test('keeps strangers', () => {
    const found = newConversationCandidates([maria, luis], {
      existing: [],
      viewerActorId: 'me',
    });

    assert.equal(found.length, 2);
  });

  test('handles a viewer with no actor yet', () => {
    const found = newConversationCandidates([maria], {
      existing: [],
      viewerActorId: null,
    });

    assert.equal(found.length, 1);
  });
});

describe('the retained mock search control is really a control', () => {
  const code = readFileSync(
    new URL(
      '../app/mock/dm-chat/_components/conversation-list.tsx',
      import.meta.url
    ),
    'utf8'
  );

  test('renders an input', () => {
    assert.match(
      code,
      /<input/,
      'the search box must be an input; it shipped as a div wrapping a span and could not be typed into'
    );
  });

  test('the input is controlled, so typing changes something', () => {
    assert.match(
      code,
      /onChange=/,
      'an input with no change handler is the same dead end in a different tag'
    );
  });

  test('the old decorative label is gone', () => {
    assert.doesNotMatch(
      code,
      /<span[^>]*>\s*Search messages\s*<\/span>/,
      'the placeholder-shaped span is back; it is what made the box look usable while doing nothing'
    );
  });
});
