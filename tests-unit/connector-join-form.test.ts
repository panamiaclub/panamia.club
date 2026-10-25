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

test('house choices remain interests rather than signup for work', () => {
  const html = renderForm();
  assert.ok(html.includes('you can help across houses'));
  assert.ok(html.includes('choosing one does not commit you to any work'));
  assert.doesNotMatch(
    html,
    /<(?:input|select|textarea)\b[^>]*name="(?:tier|availability|commitment|opportunity)[^"]*"/
  );
  assert.ok(html.includes('name="pod"'));
  assert.ok(html.includes('name="house"'));
  assert.ok(html.includes('name="bring"'));
  assert.ok(html.includes('Choose whether we can text you'));
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
