import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUSINESSES,
  businessCsv,
  isNewBusiness,
} from '../app/mock/admin-directory/data';
import { isNewDirectoryBusiness } from '../lib/admin/directory';

test('new profile count includes only the 30 calendar days in the snapshot', () => {
  const business = BUSINESSES[0];
  assert.equal(isNewBusiness({ ...business, joined: '2026-10-26' }), false);
  assert.equal(isNewBusiness({ ...business, joined: '2026-10-27' }), true);
  assert.equal(isNewBusiness({ ...business, joined: '2026-11-25' }), true);
  assert.equal(isNewBusiness({ ...business, joined: '2026-11-26' }), false);
});

test('business export escapes CSV cells and retains inactive profiles', () => {
  const csv = businessCsv([
    {
      ...BUSINESSES[0],
      name: 'Cafe "Sun", Miami',
      email: '=1+1',
      active: false,
    },
  ]);
  assert.match(
    csv,
    /"Business","Category","Location","Owner","Email","Phone","Date added","Status"\r\n/
  );
  assert.match(csv, /"Cafe ""Sun"", Miami"/);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"Inactive"$/);
});

test('live new-profile window is exactly the preceding 30 days, excluding future timestamps', () => {
  const asOf = '2026-11-25T18:30:00Z';
  const business = BUSINESSES[0];
  assert.equal(
    isNewDirectoryBusiness(
      { ...business, joined: '2026-10-26T18:30:00Z' },
      asOf
    ),
    false
  );
  assert.equal(
    isNewDirectoryBusiness(
      { ...business, joined: '2026-10-26T18:30:00.001Z' },
      asOf
    ),
    true
  );
  assert.equal(
    isNewDirectoryBusiness({ ...business, joined: asOf }, asOf),
    true
  );
  assert.equal(
    isNewDirectoryBusiness(
      { ...business, joined: '2026-11-25T18:30:00.001Z' },
      asOf
    ),
    false
  );
});
