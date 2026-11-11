import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertStagingDatabase,
  assertStagingDirectory,
  assertStagingOrigin,
  isolatedProcessEnv,
  isolatedWorkerConfig,
  type StagingState,
} from '../scripts/e2ee-staging-config';

const state: StagingState = {
  version: 1,
  runId: randomUUID(),
  directory: path.join(os.tmpdir(), 'e2ee-staging-aaaaaaaa'),
  postgresBin: path.join(os.tmpdir(), 'postgres', 'bin'),
  sourceCommit: 'a'.repeat(40),
  sourceDirty: false,
  origin: 'http://127.0.0.1:3190',
  databaseUrl:
    'postgres://pana_stage_owner:synthetic-only@127.0.0.1:55488/pana_e2ee_stage_0123456789ab',
  authSecret: 'synthetic-only-secret-'.repeat(3),
  accounts: {},
  groups: {},
};

test('pilot database writes cannot target production, a default cluster or a connection override', () => {
  assert.equal(assertStagingDatabase(state.databaseUrl).port, '55488');
  for (const url of [
    state.databaseUrl.replace('127.0.0.1', 'db.example.com'),
    state.databaseUrl.replace('55488', '5432'),
    state.databaseUrl.replace('pana_stage_owner', 'postgres'),
    state.databaseUrl.replace('pana_e2ee_stage_0123456789ab', 'postgres'),
    `${state.databaseUrl}?options=-csearch_path=public`,
    `${state.databaseUrl}#ignored`,
  ]) {
    assert.throws(() => assertStagingDatabase(url));
  }
});

test('pilot origins stay on one explicit loopback origin', () => {
  assert.equal(assertStagingOrigin(state.origin).hostname, '127.0.0.1');
  for (const origin of [
    'https://panamia.club',
    'http://0.0.0.0:3190',
    'http://127.0.0.1',
    'http://localhost:3190',
    `${state.origin}/messages`,
    `${state.origin}?token=anything`,
    'http://user@127.0.0.1:3190',
  ]) {
    assert.throws(() => assertStagingOrigin(origin));
  }
});

test('the snapshot never overwrites the current worktree or a broad output directory', () => {
  const repository = process.cwd();
  assert.equal(
    assertStagingDirectory(state.directory, repository),
    state.directory
  );
  for (const directory of [
    repository,
    path.join(repository, 'e2ee-staging-aaaaaaaa'),
    os.tmpdir(),
    path.parse(repository).root,
    'e2ee-staging-aaaaaaaa',
  ]) {
    assert.throws(() => assertStagingDirectory(directory, repository));
  }
});

test('generated bindings are an allowlist, not a copy of production resources or services', () => {
  const source = JSON.stringify({
    main: 'worker/index.ts',
    compatibility_date: '2026-02-24',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    account_id: 'production-account',
    services: [{ binding: 'RELAY', service: 'production-relay' }],
    send_email: [{ name: 'EMAIL' }],
    routes: ['production.example/*'],
    unsafe: { bindings: [{ name: 'UNREVIEWED' }] },
    vars: { CHAT_E2EE_ENABLED: '0', PRODUCTION_SECRET: 'not-for-the-pilot' },
    r2_buckets: [{ binding: 'R2_BUCKET', bucket_name: 'production-bucket' }],
  });
  const config = isolatedWorkerConfig(source, state);
  const serialized = JSON.stringify(config);
  for (const forbidden of [
    'production-account',
    'production-relay',
    'production.example',
    'not-for-the-pilot',
    'production-bucket',
    'UNREVIEWED',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(config.vars.CHAT_E2EE_ENABLED, '1');
  assert.equal(config.vars.POSTGRES_URL, state.databaseUrl);
  assert.ok(config.r2_buckets.every((bucket) => bucket.remote === false));
  assert.ok(
    config.kv_namespaces.every((namespace) => namespace.remote === false)
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
});

test('build and Worker subprocesses do not inherit real credentials or auth/config homes', () => {
  const env = isolatedProcessEnv(state, {
    NODE_ENV: 'production',
    PATH: 'installed-tools',
    HOME: 'real-home',
    APPDATA: 'real-config',
    POSTGRES_URL: 'production-database',
    BETTER_AUTH_SECRET: 'production-auth-secret',
    CLOUDFLARE_API_TOKEN: 'production-token',
    GOOGLE_CLIENT_SECRET: 'production-oauth',
    GH_TOKEN: 'github-token',
  });
  assert.equal(env.PATH, 'installed-tools');
  assert.equal(env.POSTGRES_URL, state.databaseUrl);
  assert.equal(env.BETTER_AUTH_SECRET, state.authSecret);
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.GOOGLE_CLIENT_SECRET, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.HOME, path.join(state.directory, 'home'));
  assert.equal(env.WRANGLER_SEND_METRICS, 'false');
});
