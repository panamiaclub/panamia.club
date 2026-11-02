import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/lib/i18n';
import { useStoryBeats, type StoryBeat } from '@/components/home/content';

test('the production homepage opts into neither the card proposal nor its styling', () => {
  const homepage = readFileSync(
    new URL('../components/home/home-page.tsx', import.meta.url),
    'utf8'
  );
  assert.match(homepage, /<HomeBasics\s*\/>/);
  assert.doesNotMatch(
    homepage,
    /welcome-cards|welcomeBeats|mock\.welcomeCards/
  );
});

test('the default content hook still returns the four existing cards in order', async () => {
  await i18n.changeLanguage('en');
  let beats: StoryBeat[] = [];
  function CaptureDefaults() {
    beats = useStoryBeats();
    return null;
  }
  renderToStaticMarkup(createElement(CaptureDefaults));
  assert.deepEqual(
    beats.map(({ id, question }) => [id, question]),
    [
      ['panamia', 'What is Pana MIA?'],
      ['pana', "What's a pana?"],
      ['why', 'Why was Pana MIA started?'],
      ['local', 'Why local?'],
    ]
  );
  assert.ok(beats.every((beat) => beat.body === undefined));
  assert.equal(beats[1].aside, '/pah·nah/');
  assert.equal(beats[1].detail[0].kind, 'numbered');
  assert.equal(beats[2].more, 'Read why it exists');
  assert.equal(beats[3].detail[0].kind, 'list');
});
