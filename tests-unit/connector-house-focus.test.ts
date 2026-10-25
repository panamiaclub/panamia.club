import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'vinext/shims/internal/app-router-context';
import { appRouterInstance } from 'vinext/shims/navigation';

import { HOUSES, parseHouseFocus } from '../lib/connectors/model';
import { ConnectorHousePills } from '../components/connectors/dashboard-parts';
import { HouseFocusFields } from '../components/connectors/house-focus-fields';
import { SetTaskForm } from '../components/connectors/admin-console';
import { ApplicationQueue } from '../components/connectors/application-queue';
import { LoadTable } from '../components/connectors/load-table';
import { EMPTY_LOAD } from '../lib/connectors/hours';

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

test('house focus accepts every ordered pair of distinct programme houses', () => {
  for (const major of HOUSES) {
    for (const minor of HOUSES) {
      const focus = { majorHouse: major.id, minorHouse: minor.id };
      assert.deepEqual(
        parseHouseFocus(focus),
        major.id === minor.id ? null : focus
      );
    }
  }
});

test('house focus refuses missing, unranked, unknown, and malformed choices', () => {
  for (const value of [
    null,
    undefined,
    [],
    'education',
    {},
    { houses: ['education', 'culturalWorkers'] },
    { majorHouse: 'education' },
    { minorHouse: 'education' },
    { majorHouse: 'education', minorHouse: 'retiredHouse' },
    { majorHouse: 'education', minorHouse: '' },
    { majorHouse: ['education'], minorHouse: 'culturalWorkers' },
    { majorHouse: 'education', minorHouse: 1 },
  ]) {
    assert.equal(parseHouseFocus(value), null);
  }
});

test('house labels use explicit roles even when the legacy array has another order', () => {
  const html = render(
    createElement(ConnectorHousePills, {
      houses: ['education', 'culturalWorkers'],
      majorHouse: 'culturalWorkers',
      minorHouse: 'education',
    })
  );
  assert.match(html, /Major house: Cultural Workers/);
  assert.match(html, /Minor house: Education/);
  assert.ok(html.indexOf('Major house:') < html.indexOf('Minor house:'));
});

test('unranked house pills keep every interest without inventing roles', () => {
  const html = render(
    createElement(ConnectorHousePills, {
      houses: HOUSES.map((house) => house.id),
      majorHouse: null,
      minorHouse: null,
    })
  );
  for (const house of HOUSES) assert.ok(html.includes(house.name));
  assert.doesNotMatch(html, /Major house:|Minor house:/);
});

test('house fields have native required controls with accessible descriptions', () => {
  const html = render(
    createElement(HouseFocusFields, {
      value: { majorHouse: null, minorHouse: null },
      onChange: () => {},
    })
  );
  assert.equal((html.match(/required=""/g) ?? []).length, 2);
  assert.equal((html.match(/aria-describedby="/g) ?? []).length, 2);
  for (const name of ['majorHouse', 'minorHouse']) {
    assert.match(html, new RegExp(`<label\\b[^>]*for="[^"]*-${name}"`));
    assert.match(html, new RegExp(`<select\\b[^>]*id="[^"]*-${name}"`));
  }
  assert.match(html, /disabled=""[^>]*>Swap major and minor<\/button>/);
});

test('staff see both roles when reviewing an application', () => {
  const html = render(
    createElement(ApplicationQueue, {
      applications: [
        {
          profileId: 'applicant',
          displayName: 'New Connector',
          email: 'connector@example.invalid',
          pod: 'miami',
          houses: ['culturalWorkers', 'education'],
          majorHouse: 'culturalWorkers',
          minorHouse: 'education',
          bring: '',
          appliedAt: '2026-10-25T12:00:00.000Z',
        },
      ],
    })
  );
  assert.match(html, /Major house: Cultural Workers/);
  assert.match(html, /Minor house: Education/);
  assert.match(html, />Accept<\/button>/);
});

test('coordination load rows carry the same major/minor labels', () => {
  const html = render(
    createElement(LoadTable, {
      rows: [
        {
          profileId: 'member',
          displayName: 'Active Connector',
          houses: ['culturalWorkers', 'education'],
          majorHouse: 'culturalWorkers',
          minorHouse: 'education',
          load: EMPTY_LOAD,
        },
      ],
    })
  );
  assert.match(html, /Major house: Cultural Workers/);
  assert.match(html, /Minor house: Education/);
});

test('staff can assign work across all houses, not only the member focus pair', () => {
  const html = render(
    createElement(SetTaskForm, {
      connector: {
        profileId: 'member',
        displayName: 'Active Connector',
        houses: ['education', 'culturalWorkers'],
      },
    })
  );
  for (const house of HOUSES) {
    assert.match(html, new RegExp(`<option value="${house.id}">`));
  }
});
