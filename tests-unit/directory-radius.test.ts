import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  DEFAULT_DIRECTORY_RADIUS,
  DIRECTORY_RADIUS_OPTIONS,
  effectiveDirectoryRadius,
  matchesDirectoryRadius,
  parseDirectoryRadius,
} from '../lib/directory-radius';
import {
  searchParamsToString,
  type DirectorySearchParams,
} from '../lib/query/directory';
import { getDirectorySearchParams } from '../app/directory/search/_lib/search-params';

describe('viewport-based directory parameters', () => {
  it('ignores every legacy radius without losing the supported filters', () => {
    for (const radius of ['5', '10', '25', '50', 'all', 'invalid', '']) {
      const params = getDirectorySearchParams(
        new URLSearchParams(
          `radius=${radius}&fcat=food%2Bart&sort=name&certified=true&events=true`
        ),
        'coffee'
      );
      assert.equal(params.radius, 'all');
      assert.equal(params.searchTerm, 'coffee');
      assert.equal(params.filterCategories, 'food+art');
      assert.equal(params.sort, 'name');
      assert.equal(params.certifiedOnly, true);
      assert.equal(params.withEventsOnly, true);
    }
    assert.equal(getDirectorySearchParams(new URLSearchParams()).radius, 'all');
  });

  it('requests all areas before and after location sharing, for list and map queries', () => {
    const params = getDirectorySearchParams(
      new URLSearchParams('radius=5&sort=nearest')
    );
    for (const resultsView of [undefined, 'map'] as const) {
      for (const geolat of [0, 25.761689]) {
        const query = new URLSearchParams(
          searchParamsToString({
            ...params,
            sort: 'nearest',
            resultsView,
            geolat,
            geolng: geolat ? -80.191788 : 0,
          })
        );
        assert.equal(query.get('radius'), 'all');
        assert.equal(query.get('geolat'), geolat ? '25.76' : null);
        assert.equal(query.get('geolng'), geolat ? '-80.19' : null);
      }
    }
  });
});

describe('directory radius parsing', () => {
  it('accepts only the public radius options', () => {
    for (const option of DIRECTORY_RADIUS_OPTIONS) {
      assert.equal(parseDirectoryRadius(option.value), option.value);
    }
  });

  it('falls back safely for missing or arbitrary values', () => {
    assert.equal(parseDirectoryRadius(null), DEFAULT_DIRECTORY_RADIUS);
    assert.equal(parseDirectoryRadius('6'), DEFAULT_DIRECTORY_RADIUS);
    assert.equal(parseDirectoryRadius('-1'), DEFAULT_DIRECTORY_RADIUS);
    assert.equal(parseDirectoryRadius('all?'), DEFAULT_DIRECTORY_RADIUS);
  });

  it('uses All South Florida when viewer coordinates are unavailable', () => {
    assert.equal(effectiveDirectoryRadius('5', false), 'all');
    assert.equal(effectiveDirectoryRadius('50', false), 'all');
    assert.equal(effectiveDirectoryRadius('10', true), '10');
  });
});

describe('directory radius filtering', () => {
  it('includes listings inside and exactly on the boundary', () => {
    assert.equal(matchesDirectoryRadius(4.999, '5'), true);
    assert.equal(matchesDirectoryRadius(5, '5'), true);
  });

  it('excludes listings outside the boundary', () => {
    assert.equal(matchesDirectoryRadius(5.001, '5'), false);
  });

  it('excludes missing locations but includes usable ZIP-area distances', () => {
    assert.equal(matchesDirectoryRadius(null, '5'), false);
    assert.equal(matchesDirectoryRadius(1, '5'), true);
    assert.equal(matchesDirectoryRadius(NaN, '5'), false);
  });

  it('keeps every listing in All South Florida mode', () => {
    assert.equal(matchesDirectoryRadius(null, 'all'), true);
    assert.equal(matchesDirectoryRadius(500, 'all'), true);
    assert.equal(matchesDirectoryRadius(null, 'all'), true);
  });
});

describe('directory radius query encoding', () => {
  const base: DirectorySearchParams = {
    pageNum: 1,
    pageLimit: 20,
    searchTerm: '',
    filterCategories: '',
    geolat: 25.7617,
    geolng: -80.1918,
    radius: '5',
  };

  it('encodes radius and only coarse coordinates', () => {
    const query = new URLSearchParams(searchParamsToString(base));
    assert.equal(query.get('radius'), '5');
    assert.equal(query.get('geolat'), '25.76');
    assert.equal(query.get('geolng'), '-80.19');
    assert.equal(query.has('floc'), false);
  });

  it('encodes All South Florida without inventing coordinates', () => {
    const query = new URLSearchParams(
      searchParamsToString({
        ...base,
        geolat: 0,
        geolng: 0,
        radius: 'all',
      })
    );
    assert.equal(query.get('radius'), 'all');
    assert.equal(query.has('geolat'), false);
    assert.equal(query.has('geolng'), false);
  });

  it('distinguishes complete-map requests without changing their filters', () => {
    const list = new URLSearchParams(searchParamsToString(base));
    const map = new URLSearchParams(
      searchParamsToString({ ...base, resultsView: 'map' })
    );
    assert.equal(map.get('v'), 'map');
    assert.equal(map.get('mapVersion'), '2');
    assert.equal(list.has('v'), false);
    map.delete('v');
    map.delete('mapVersion');
    assert.equal(map.toString(), list.toString());
  });
});
