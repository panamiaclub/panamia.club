import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSafetyReportReason,
  isSafetyReportTargetType,
  safetyReportUrl,
} from '../lib/safety-report';
import {
  addressForCategory,
  notificationRecipients,
} from '../lib/contact-routing';

test('accepts explicit safety reasons and target types, not object properties', () => {
  assert.ok(isSafetyReportReason('child_safety'));
  assert.ok(isSafetyReportReason('harassment'));
  assert.ok(isSafetyReportTargetType('user'));
  assert.ok(isSafetyReportTargetType('content'));
  for (const invalid of [
    '',
    null,
    {},
    'constructor',
    '__proto__',
    'toString',
  ]) {
    assert.equal(isSafetyReportReason(invalid), false);
    assert.equal(isSafetyReportTargetType(invalid), false);
  }
});

test('normalizes contextual links while rejecting unsafe or credential-bearing URLs', () => {
  assert.equal(
    safetyReportUrl('/p/someone/post#message-1', 'https://panamia.club'),
    'https://panamia.club/p/someone/post#message-1'
  );
  assert.equal(
    safetyReportUrl('https://remote.example/posts/one'),
    'https://remote.example/posts/one'
  );
  for (const invalid of [
    '',
    '/relative-without-an-origin',
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///private.txt',
    'https://name:password@example.com/post',
    `https://example.com/${'x'.repeat(2000)}`,
  ]) {
    assert.equal(safetyReportUrl(invalid), null);
  }
});

test('routes safety reports to the approved safety inbox without changing legacy routing', () => {
  assert.equal(addressForCategory('safety'), 'hola@panamia.club');
  assert.deepEqual(notificationRecipients('safety', false), [
    'hola@panamia.club',
  ]);
  assert.deepEqual(notificationRecipients('safety', true), [
    'hola@panamia.club',
  ]);
  assert.equal(addressForCategory('technical'), 'hola@pana.social');
});
