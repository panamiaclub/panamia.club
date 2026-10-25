import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';
import { appRouterInstance } from 'vinext/shims/navigation';
import {
  InactiveRoster,
  RosterEditor,
  type RosterRow,
} from '../components/connectors/admin-console';

const returning: RosterRow = {
  profileId: 'returning',
  displayName: 'Returning Connector',
  pod: 'broward',
  houses: ['education', 'culturalWorkers'],
  majorHouse: 'education',
  minorHouse: 'culturalWorkers',
  tier: 3,
};

function render(element: ReactElement): string {
  assert.ok(AppRouterContext);
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: appRouterInstance },
      element
    )
  );
}

test('inactive recovery has an honest empty state without a reactivation button', () => {
  const html = render(createElement(InactiveRoster, { rows: [] }));
  assert.match(html, /No offboarded connectors/);
  assert.doesNotMatch(html, /Reactivate<\/button>/);
});

test('offboarded Connectors expose a confirmation entry point and retain their tier', () => {
  const html = render(
    createElement(InactiveRoster, {
      rows: [{ ...returning, offboardReason: 'Staff-only context' }],
    })
  );
  assert.match(html, /Returning Connector/);
  assert.match(html, /Broward/);
  assert.match(html, /Tier 3/);
  assert.match(html, /Reactivate<\/button>/);
  assert.match(html, /Staff-only context/);
  assert.match(html, /This does not reopen the signup form/);
  assert.doesNotMatch(html, /Confirm reactivation/);
});

test('a roster row uses authoritative values before any local draft exists', () => {
  const html = render(createElement(RosterEditor, { rows: [returning] }));
  assert.match(html, /Returning Connector/);
  assert.match(html, /<option\b(?=[^>]*value="3")(?=[^>]*selected="")[^>]*>/);
  assert.equal((html.match(/selected=""/g) ?? []).length, 3);
  assert.match(html, /Major house/);
  assert.match(html, /Minor house/);
  assert.match(
    html,
    /<option\b(?=[^>]*value="education")(?=[^>]*selected="")[^>]*>/
  );
  assert.match(
    html,
    /<option\b(?=[^>]*value="culturalWorkers")(?=[^>]*selected="")[^>]*>/
  );
  assert.match(html, /disabled=""[^>]*>Save<\/button>/);
});

test('legacy roster rows show unranked interests without selecting house roles', () => {
  const html = render(
    createElement(RosterEditor, {
      rows: [{ ...returning, majorHouse: null, minorHouse: null }],
    })
  );
  assert.match(html, /Major\/minor not confirmed/);
  assert.match(html, /Current interests: Education, Cultural Workers/);
  assert.match(html, /Leave both blank/);
  for (const name of ['majorHouse', 'minorHouse']) {
    const select = html.match(
      new RegExp(`<select\\b[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`)
    );
    assert.ok(select);
    assert.match(
      select[1],
      /<option\b(?=[^>]*value="")(?=[^>]*selected="")[^>]*>/
    );
    assert.doesNotMatch(select[0], /required=""/);
  }
});
