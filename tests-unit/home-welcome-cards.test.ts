import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/lib/i18n';
import {
  useStoryBeats,
  useLocalMovementBeat,
  type StoryBeat,
} from '@/components/home/content';

function captureContent() {
  let beats: StoryBeat[] = [];
  let localMovement: StoryBeat | undefined;
  function CaptureDefaults() {
    beats = useStoryBeats();
    localMovement = useLocalMovementBeat();
    return null;
  }
  renderToStaticMarkup(createElement(CaptureDefaults));
  assert.ok(localMovement);
  return { beats, localMovement };
}

test('production and mock use the same welcome cards without overrides', () => {
  for (const path of [
    '../components/home/home-page.tsx',
    '../app/mock/home/_components/home-mock.tsx',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /<HomeBasics\s*\/>/);
    assert.doesNotMatch(
      source,
      /welcome-cards|welcomeBeats|mock\.welcomeCards/
    );
  }
  const sections = readFileSync(
    new URL('../components/home/sections.tsx', import.meta.url),
    'utf8'
  );
  assert.match(sections, /i18nKey="basics\.introduction"/);
});

test('the default content hook returns the three approved cards in order', async () => {
  await i18n.changeLanguage('en');
  const { beats } = captureContent();
  assert.deepEqual(
    beats.map(({ id, question }) => [id, question]),
    [
      ['pana', 'What is Pana?'],
      ['future-local', "Why 'The Future is Local'?"],
      ['why', 'Why was Pana MIA started?'],
    ]
  );
  assert.equal(beats[0].aside, '/pah*nah/');
  assert.equal(beats[0].anchor, 'faq-what-is-a-pana');
  const definition = beats[0].detail.find(
    (block) => block.kind === 'definition'
  );
  assert.ok(definition);
  assert.equal(definition.items.length, 4);
  assert.equal(definition.items[2], 'Someone involved with Pana MIA Club');
  assert.equal(
    definition.items[3],
    'Someone who enjoys a locally-centered lifestyle'
  );
  assert.equal(beats[1].anchor, 'why-local');
  assert.equal(beats[1].detail[1].kind, 'heading');
  assert.equal(beats[2].more, 'Read why it exists');
  assert.equal(beats[2].body, undefined);
});

test('About Us retains the independent local-movement content', async () => {
  await i18n.changeLanguage('en');
  const { beats, localMovement } = captureContent();
  assert.equal(localMovement.id, 'local');
  assert.equal(localMovement.question, 'Why local?');
  assert.equal(
    localMovement.answer,
    'Because communities know their own needs best, and they are the ones best equipped to meet them.'
  );
  assert.equal(localMovement.scene.kind, 'map');
  assert.equal(localMovement.detail[0].kind, 'list');
  assert.deepEqual(beats[1].detail.at(-1), localMovement.detail[0]);
  assert.ok(beats.every((beat) => beat.id !== 'local'));
});

test('Spanish welcome cards keep the same structure and complete definitions', async () => {
  await i18n.changeLanguage('es');
  const { beats } = captureContent();
  assert.deepEqual(
    beats.map(({ id, question }) => [id, question]),
    [
      ['pana', '¿Qué es Pana?'],
      ['future-local', '¿Por qué “El futuro es local”?'],
      ['why', '¿Por qué se fundó Pana MIA?'],
    ]
  );
  const definition = beats[0].detail.find(
    (block) => block.kind === 'definition'
  );
  assert.ok(definition);
  assert.equal(definition.items.length, 4);
  assert.equal(definition.items[0], beats[0].answer);
});
