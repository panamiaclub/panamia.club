import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appRouterInstance } from 'vinext/shims/navigation';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';

import { ConnectorJoinForm } from '../components/connectors/join-form';
import { getTier, TIERS, type TierId } from '../lib/connectors/model';
import { CONNECTORS_CHROME } from '../lib/connectors/theme';

function renderForm(
  props: ComponentProps<typeof ConnectorJoinForm> = {}
): string {
  assert.ok(AppRouterContext);
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: appRouterInstance },
      createElement(ConnectorJoinForm, props)
    )
  );
}

function assertHighlightedTier(html: string, expected: TierId) {
  const ladder = html.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(ladder);
  for (const tier of TIERS) {
    const badge: RegExpMatchArray | null = ladder.match(
      new RegExp(`<span class="([^"]*)">Tier ${tier.id}</span>`)
    );
    assert.ok(badge);
    assert.equal(
      badge[1].split(' ').includes(CONNECTORS_CHROME.FILL),
      tier.id === expected,
      `Tier ${tier.id} highlight should reflect the actual tier`
    );
  }
}

test('new Connector applications explain review before immediate opportunity signup', () => {
  const html = renderForm();
  assert.ok(
    html.includes(`>You would start at Tier 1 \u2014 ${getTier(1).name}</h2>`)
  );
  assert.ok(html.includes('The programme team reviews your application.'));
  assert.ok(html.includes('Once accepted, choose your first opportunity in'));
  assert.ok(html.includes('without another approval step.'));
  assert.ok(html.includes('href="/connectors/hq"'));
  assert.ok(html.includes('Send my application'));
  assertHighlightedTier(html, 1);
});

test('both distinct house roles are required without signing up for work', () => {
  const html = renderForm();
  assert.ok(html.includes('You can help across houses'));
  assert.ok(html.includes('these choices do not commit you to any work'));
  assert.ok(html.includes('Both are required and must be different.'));
  assert.match(
    html,
    /<select\b(?=[^>]*name="majorHouse")(?=[^>]*required="")[^>]*>/
  );
  assert.match(
    html,
    /<select\b(?=[^>]*name="minorHouse")(?=[^>]*required="")[^>]*>/
  );
  assert.ok(html.includes('Primary focus (required)'));
  assert.ok(html.includes('Secondary focus (required)'));
  assert.doesNotMatch(
    html,
    /<(?:input|select|textarea)\b[^>]*name="(?:tier|availability|commitment|opportunity)[^"]*"/
  );
  assert.ok(html.includes('name="pod"'));
  assert.doesNotMatch(html, /name="house"/);
  assert.ok(html.includes('name="bring"'));
  assert.ok(html.includes('Choose whether we can text you'));
});

test('editing restores explicit house roles rather than array order', () => {
  const html = renderForm({
    isEditing: true,
    initialHouses: ['education', 'culturalWorkers'],
    initialMajorHouse: 'culturalWorkers',
    initialMinorHouse: 'education',
  });
  const major = html.match(
    /<select\b[^>]*name="majorHouse"[^>]*>([\s\S]*?)<\/select>/
  )?.[1];
  const minor = html.match(
    /<select\b[^>]*name="minorHouse"[^>]*>([\s\S]*?)<\/select>/
  )?.[1];
  assert.ok(major);
  assert.ok(minor);
  assert.match(
    major,
    /<option\b(?=[^>]*value="culturalWorkers")(?=[^>]*selected="")[^>]*>/
  );
  assert.match(
    minor,
    /<option\b(?=[^>]*value="education")(?=[^>]*selected="")[^>]*>/
  );
  assert.match(
    major,
    /<option\b(?=[^>]*value="education")(?=[^>]*disabled="")[^>]*>/
  );
  assert.match(
    minor,
    /<option\b(?=[^>]*value="culturalWorkers")(?=[^>]*disabled="")[^>]*>/
  );
  assert.doesNotMatch(html, /Those interests were not ranked/);
});

test('legacy selections stay visible but never become inferred house roles', () => {
  const html = renderForm({
    isEditing: true,
    initialHouses: [
      'narrativeShifters',
      'education',
      'culturalWorkers',
      'relationshipBuilding',
    ],
  });
  assert.match(html, /Those interests were not ranked/);
  assert.match(
    html,
    /Narrative Shifters, Education, Cultural Workers, Relationship Building/
  );
  const selects = html.match(/<select\b[^>]*>[\s\S]*?<\/select>/g);
  assert.equal(selects?.length, 2);
  for (const select of selects ?? []) {
    assert.match(
      select,
      /<option\b(?=[^>]*value="")(?=[^>]*selected="")[^>]*>/
    );
    assert.doesNotMatch(
      select,
      /<option\b(?=[^>]*value="[^"]+")(?=[^>]*selected="")[^>]*>/
    );
  }
});

for (const tier of TIERS) {
  test(`editing a Tier ${tier.id} membership shows its actual tier without reopening admission`, () => {
    const html = renderForm({
      isEditing: true,
      currentTier: tier.id,
      initialPod: 'broward',
      initialHouses: ['education'],
      initialBring: 'I can help with translation.',
    });
    assert.ok(html.includes(`>Tier ${tier.id} \u2014 ${tier.name}</h2>`));
    assert.ok(html.includes(tier.blurb));
    assert.ok(
      html.includes('Changing these answers does not change your tier.')
    );
    assert.ok(
      html.includes(
        'Your membership, tier and existing commitments stay the same.'
      )
    );
    assert.ok(html.includes('Find opportunities in Connector HQ'));
    assert.ok(html.includes('Save changes'));
    assert.ok(html.includes('I can help with translation.'));
    assert.doesNotMatch(
      html,
      /Send my application|Your application stays in review/
    );
    assertHighlightedTier(html, tier.id);
  });
}

test('editing a pending application preserves its review explanation', () => {
  const html = renderForm({ isEditing: true, isPending: true });
  assert.ok(html.includes('Your application has not been decided on yet'));
  assert.ok(html.includes('Your application stays in review.'));
  assert.ok(html.includes('Once accepted, choose your first opportunity in'));
  assert.ok(html.includes('Save changes'));
  assert.doesNotMatch(
    html,
    /Your membership, tier and existing commitments stay the same/
  );
  assertHighlightedTier(html, 1);
});

test('a new applicant always starts at Tier 1 rather than choosing a tier', () => {
  const html = renderForm({ currentTier: 3 });
  assert.ok(
    html.includes(`>You would start at Tier 1 \u2014 ${getTier(1).name}</h2>`)
  );
  assertHighlightedTier(html, 1);
  assert.doesNotMatch(html, /<(?:input|select|textarea)\b[^>]*name="tier"/);
});
