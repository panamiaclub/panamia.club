import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isLocalMockDependencyRequest,
  isLocalMockRequest,
  isLoopbackHostname,
} from '@/lib/server/local-mock-request';

describe('local mock request bypass', () => {
  test('recognizes common loopback hostnames', () => {
    assert.equal(isLoopbackHostname('localhost'), true);
    assert.equal(isLoopbackHostname('social.localhost'), true);
    assert.equal(isLoopbackHostname('127.0.0.1'), true);
    assert.equal(isLoopbackHostname('[::1]'), true);
  });

  test('allows a local mock route when no database is configured', () => {
    assert.equal(
      isLocalMockRequest(new URL('http://127.0.0.1:3001/mock/feed'), false),
      true
    );
  });

  test('never bypasses the database for real routes', () => {
    assert.equal(
      isLocalMockRequest(new URL('http://127.0.0.1:3001/s'), false),
      false
    );
  });

  test('never bypasses the database on a deployed host', () => {
    assert.equal(
      isLocalMockRequest(
        new URL('https://social.panamia.club/mock/feed'),
        false
      ),
      false
    );
  });

  test('uses the normal database path when a binding is available', () => {
    assert.equal(
      isLocalMockRequest(new URL('http://localhost:3001/mock/feed'), true),
      false
    );
  });

  test('recognizes same-origin dependencies loaded by a local mock', () => {
    assert.equal(
      isLocalMockDependencyRequest(
        new URL('http://127.0.0.1:3001/api/auth/get-session'),
        'http://127.0.0.1:3001/mock/group',
        false
      ),
      true
    );
  });

  test('rejects dependencies referred by real or cross-origin pages', () => {
    const dependency = new URL('http://127.0.0.1:3001/api/auth/get-session');

    assert.equal(
      isLocalMockDependencyRequest(
        dependency,
        'http://127.0.0.1:3001/s',
        false
      ),
      false
    );
    assert.equal(
      isLocalMockDependencyRequest(
        dependency,
        'https://example.com/mock/group',
        false
      ),
      false
    );
  });
});
