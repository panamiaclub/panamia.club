import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, mock, test } from 'node:test';

const original = {
  flag: process.env.NEXT_PUBLIC_HOSTED_STAGING,
  origin: process.env.NEXT_PUBLIC_HOST_URL,
  project: process.env.NEXT_PUBLIC_STAGING_PROJECT_REF,
  source: process.env.NEXT_PUBLIC_STAGING_SOURCE_SHA,
};
const origin = 'https://staging.panamia.club';
const project = 's'.repeat(20);
const source = 'a'.repeat(40);
const userId = randomUUID();
let member = userId;
let marker;
let tokenRow;
let downstream;
let databaseReads;
let retentionRuns;
let retentionReport;
let retentionError;
let ledgerOutcomes;
let parentMaintenance;
const messages = [];
const originalError = console.error;
console.error = (...args) => messages.push(JSON.stringify(args));

mock.module(import.meta.resolve('../worker/index.ts'), {
  defaultExport: {
    fetch: async () => {
      downstream++;
      return Response.json({ delegated: true });
    },
    scheduled: async () => {
      parentMaintenance++;
    },
  },
  namedExports: { SignalingRoom: class {}, DmStream: class {} },
});
mock.module(import.meta.resolve('../lib/r2.ts'), {
  namedExports: {
    getPrivateChatStorage: (env) => env.CHAT_E2EE_BUCKET ?? null,
  },
});
mock.module(import.meta.resolve('../lib/jobs/purge-encrypted-chat.ts'), {
  namedExports: {
    ENCRYPTED_CHAT_RETENTION_JOB: 'encrypted-chat-retention',
    purgeEncryptedChat: async (limit) => {
      assert.equal(limit, 100);
      retentionRuns++;
      if (retentionError) throw retentionError;
      return retentionReport;
    },
  },
});
mock.module(import.meta.resolve('../lib/jobs/ledger.ts'), {
  namedExports: {
    beginJobRun: async (job, trigger) => {
      assert.equal(job, 'encrypted-chat-retention');
      assert.equal(trigger, '0 * * * *');
      return 'stage-retention-run';
    },
    completeJobRun: async (handle, outcome) => {
      assert.equal(handle, 'stage-retention-run');
      ledgerOutcomes.push(outcome);
    },
  },
});
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    resolveUserIdFromHeaders: async () => member,
  },
});
mock.module(import.meta.resolve('../lib/db.ts'), {
  namedExports: {
    db: {
      execute: async () => {
        databaseReads++;
        return [{ descriptor: marker }];
      },
      query: {
        verification: { findFirst: async () => tokenRow },
        users: { findFirst: async () => ({ id: userId }) },
      },
    },
    runWithDb: (_env, operation) => operation(),
  },
});
const staging = (await import('../worker/staging.ts')).default;
const env = {
  POSTGRES_URL: `postgres://postgres:test-only-password@db.${project}.supabase.co:5432/postgres?sslmode=verify-full`,
};
const maintenanceEnv = { ...env, CHAT_E2EE_BUCKET: { delete() {} } };
const request = (path, options = {}) =>
  new Request(`${origin}${path}`, {
    ...options,
    headers: { Host: 'staging.panamia.club', ...options.headers },
  });

beforeEach(() => {
  process.env.NEXT_PUBLIC_HOSTED_STAGING = '1';
  process.env.NEXT_PUBLIC_HOST_URL = origin;
  process.env.NEXT_PUBLIC_STAGING_PROJECT_REF = project;
  process.env.NEXT_PUBLIC_STAGING_SOURCE_SHA = source;
  member = userId;
  marker = {
    version: 1,
    environment: 'staging',
    worker: 'panamia-staging',
    origin,
    databaseProjectRef: project,
    sourceCommit: source,
    allowedUserIds: [userId],
    access: 'ready',
  };
  tokenRow = {
    value: JSON.stringify({
      type: 'magic-link',
      email: 'stage-demo-alice@e2ee-staging.invalid',
    }),
    expiresAt: new Date(Date.now() + 60_000),
  };
  downstream = 0;
  databaseReads = 0;
  messages.length = 0;
  retentionRuns = 0;
  retentionReport = { objectsDeleted: 1, objectsDeferred: 0 };
  retentionError = undefined;
  ledgerOutcomes = [];
  parentMaintenance = 0;
});

after(() => {
  for (const [name, value] of [
    ['NEXT_PUBLIC_HOSTED_STAGING', original.flag],
    ['NEXT_PUBLIC_HOST_URL', original.origin],
    ['NEXT_PUBLIC_STAGING_PROJECT_REF', original.project],
    ['NEXT_PUBLIC_STAGING_SOURCE_SHA', original.source],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  console.error = originalError;
});

test('hosted staging refuses a production connection or forbidden bindings before opening a database', async () => {
  for (const invalid of [
    { ...env, POSTGRES_URL: env.POSTGRES_URL.replace(project, 'p'.repeat(20)) },
    { ...env, HYPERDRIVE: { connectionString: 'production' } },
    { ...env, EMAIL: { send() {} } },
    { ...env, RELAY: { fetch() {} } },
  ]) {
    const response = await staging.fetch(request('/messages'), invalid);
    assert.equal(response.status, 503);
  }
  assert.equal(databaseReads, 0);
  assert.equal(downstream, 0);
  assert.equal(
    messages.some((message) => message.includes('test-only-password')),
    false
  );
});

test('wrong origin, missing build marker and unverified TLS fail closed', async () => {
  let response = await staging.fetch(
    new Request('https://panamia.club/messages', {
      headers: { Host: 'panamia.club' },
    }),
    env
  );
  assert.equal(response.status, 421);
  process.env.NEXT_PUBLIC_HOSTED_STAGING = '0';
  response = await staging.fetch(request('/messages'), env);
  assert.equal(response.status, 503);
  process.env.NEXT_PUBLIC_HOSTED_STAGING = '1';
  response = await staging.fetch(request('/messages'), {
    ...env,
    POSTGRES_URL: env.POSTGRES_URL.replace('verify-full', 'require'),
  });
  assert.equal(response.status, 503);
  assert.equal(databaseReads, 0);
});

test('health requires the exact owned marker and exposes no account or credential material', async () => {
  let response = await staging.fetch(request('/__staging/health'), env);
  assert.deepEqual(await response.json(), {
    environment: 'staging',
    sourceCommit: source,
    access: 'ready',
  });
  marker.sourceCommit = 'b'.repeat(40);
  response = await staging.fetch(request('/__staging/health'), env);
  assert.equal(response.status, 503);
  assert.equal(downstream, 0);
});

test('paused or legacy markers refuse new test traffic and invitations but preserve admitted sign-out', async () => {
  for (const access of ['paused', undefined]) {
    marker.access = access;
    const before = JSON.stringify(marker);
    for (const path of [
      '/messages',
      '/ws/dm',
      '/api/social/encryption/devices',
      `/api/auth/magic-link/verify?token=${'a'.repeat(43)}`,
    ]) {
      const response = await staging.fetch(request(path), env);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'STAGING_PAUSED');
    }
    const health = await staging.fetch(request('/__staging/health'), env);
    assert.equal((await health.json()).access, 'paused');
    assert.equal(JSON.stringify(marker), before);
  }
  assert.equal(downstream, 0);
  let signout = await staging.fetch(
    request('/api/auth/sign-out', { method: 'POST' }),
    env
  );
  assert.equal(signout.status, 200);
  member = randomUUID();
  signout = await staging.fetch(
    request('/api/auth/sign-out', { method: 'POST' }),
    env
  );
  assert.equal(signout.status, 401);
  assert.equal(downstream, 1);
});

test('only the source-verified staging private retention job runs, including while access is paused', async () => {
  marker.access = 'paused';
  await staging.scheduled({ cron: '0 * * * *' }, maintenanceEnv);
  assert.equal(databaseReads, 1);
  assert.equal(retentionRuns, 1);
  assert.equal(parentMaintenance, 0);
  assert.deepEqual(ledgerOutcomes, [
    { ok: true, report: retentionReport, errorCount: 0 },
  ]);
});

test('maintenance rejects wrong projects, integrations, schedules or source markers before deleting anything', async () => {
  for (const invalid of [
    {
      ...maintenanceEnv,
      POSTGRES_URL: env.POSTGRES_URL.replace(project, 'p'.repeat(20)),
    },
    { ...maintenanceEnv, EMAIL: { send() {} } },
    { ...maintenanceEnv, RELAY: { fetch() {} } },
  ]) {
    await assert.rejects(staging.scheduled({ cron: '0 * * * *' }, invalid));
  }
  await assert.rejects(
    staging.scheduled({ cron: '* * * * *' }, maintenanceEnv)
  );
  assert.equal(databaseReads, 0);
  marker.sourceCommit = 'b'.repeat(40);
  await assert.rejects(
    staging.scheduled({ cron: '0 * * * *' }, maintenanceEnv)
  );
  assert.equal(retentionRuns, 0);
  assert.equal(parentMaintenance, 0);
  assert.equal(ledgerOutcomes.length, 0);
});

test('maintenance never falls back to public media when its private bucket is absent', async () => {
  await assert.rejects(
    staging.scheduled(
      { cron: '0 * * * *' },
      { ...env, R2_BUCKET: { delete() {} } }
    )
  );
  assert.equal(retentionRuns, 0);
  assert.equal(ledgerOutcomes.length, 0);
});

test('maintenance records failure and propagates deferred deletions or exceptions without logging private error contents', async () => {
  retentionReport = { objectsDeleted: 0, objectsDeferred: 1 };
  await assert.rejects(
    staging.scheduled({ cron: '0 * * * *' }, maintenanceEnv)
  );
  retentionError = new Error('PRIVATE_TEST_CREDENTIAL');
  await assert.rejects(
    staging.scheduled({ cron: '0 * * * *' }, maintenanceEnv)
  );
  assert.deepEqual(
    ledgerOutcomes.map((outcome) => outcome.ok),
    [false, false]
  );
  assert.equal(
    messages.some((message) => message.includes('PRIVATE_TEST_CREDENTIAL')),
    false
  );
  assert.equal(parentMaintenance, 0);
});

test('unsigned or non-invited sessions cannot use messaging or name their own admitted identity', async () => {
  for (const invalid of [null, randomUUID()]) {
    member = invalid;
    const response = await staging.fetch(
      request('/api/social/encryption/devices', {
        headers: { 'x-pana-mailbox-user': userId },
      }),
      env
    );
    assert.equal(response.status, 401);
  }
  assert.equal(downstream, 0);
});

test('only preseeded current one-use invitations reach the real auth handler', async () => {
  member = null;
  const token = 'a'.repeat(43);
  let response = await staging.fetch(
    request(`/api/auth/magic-link/verify?token=${token}`),
    env
  );
  assert.equal(response.status, 200);
  assert.equal(downstream, 1);
  tokenRow.expiresAt = new Date(Date.now() - 1);
  response = await staging.fetch(
    request(`/api/auth/magic-link/verify?token=${token}`),
    env
  );
  assert.equal(response.status, 403);
  response = await staging.fetch(
    request(`/api/auth/magic-link/verify?token=${token}&token=${token}`),
    env
  );
  assert.equal(response.status, 403);
  assert.equal(downstream, 1);
});

test('admitted messaging preserves no-store/noindex headers while external publishing is unavailable', async () => {
  const response = await staging.fetch(request('/messages'), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  for (const path of [
    '/api/articles/test/publish',
    '/api/internal/tasks',
    '/api/social/actors/remote/follow',
  ]) {
    const denied = await staging.fetch(request(path, { method: 'POST' }), env);
    assert.equal(denied.status, 403);
  }
  const publication = await staging.fetch(
    request('/api/social/statuses', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'public', content: 'test' }),
    }),
    env
  );
  assert.equal(publication.status, 403);
  assert.equal(downstream, 1);
});
