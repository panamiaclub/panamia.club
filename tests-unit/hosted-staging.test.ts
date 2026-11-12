import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  hostedStagingConfig,
  hostedStagingProcessEnv,
  hostedMigrationArguments,
  assertBuiltStagingConfig,
} from '../scripts/hosted-staging-config';
import {
  mobileMagicLinkAppUrl,
  mobileMagicLinkIntentUrl,
  nativeDeepLinkUrl,
} from '../lib/mobile/auth-links';
import {
  getMobileAppId,
  MOBILE_APP_ID,
  STAGING_MOBILE_APP_ID,
} from '../lib/mobile/app-identity';
import {
  hostedStagingDescriptorSchema,
  hostedStagingResourcesSchema,
  stagingDatabaseUrl,
  stagingMutationAllowed,
  stagingOrigin,
  stagingResourceBoundary,
} from '../lib/staging-contract';

const resources = hostedStagingResourcesSchema.parse({
  version: 1,
  environment: 'staging',
  worker: 'panamia-staging',
  accountId: 'a'.repeat(32),
  origin: 'https://staging.panamia.club',
  databaseProjectRef: 's'.repeat(20),
  productionDatabaseProjectRef: 'p'.repeat(20),
  kvNamespaceId: 'b'.repeat(32),
  publicBucket: 'panamia-staging-media',
  privateBucket: 'panamia-staging-chat-private',
});

test('hosted origins cannot target production, plain HTTP, arbitrary hosts or URL credentials', () => {
  assert.equal(stagingOrigin(resources.origin).origin, resources.origin);
  assert.equal(
    stagingOrigin('https://panamia-staging.example.workers.dev').hostname,
    'panamia-staging.example.workers.dev'
  );
  for (const value of [
    'https://panamia.club',
    'https://social.panamia.club',
    'http://staging.panamia.club',
    'https://staging.panamia.club:8443',
    'https://staging.panamia.club/messages',
    'https://user@staging.panamia.club',
    'https://staging.panamia.club.evil.example',
    'https://another-worker.example.workers.dev',
  ]) {
    assert.throws(() => stagingOrigin(value));
  }
});

test('a project-specific direct or session-pooler URL cannot silently become production or transaction pooling', () => {
  const direct = `postgres://postgres:test-only-password@db.${resources.databaseProjectRef}.supabase.co:5432/postgres`;
  const pooled = `postgres://postgres.${resources.databaseProjectRef}:test-only-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  assert.equal(stagingDatabaseUrl(direct, resources).port, '5432');
  assert.equal(
    stagingDatabaseUrl(pooled, resources).username,
    `postgres.${resources.databaseProjectRef}`
  );
  for (const value of [
    direct.replace(
      resources.databaseProjectRef,
      resources.productionDatabaseProjectRef
    ),
    pooled.replace(
      resources.databaseProjectRef,
      resources.productionDatabaseProjectRef
    ),
    pooled.replace(':5432/', ':6543/'),
    direct.replace('.supabase.co', '.supabase.co.evil.example'),
    direct.replace('test-only-password', ''),
    `${direct}?options=-csearch_path=public`,
    `${direct}?sslmode=disable`,
  ]) {
    assert.throws(() => stagingDatabaseUrl(value, resources));
  }
});

test('resource identity refuses production database and cache reuse or a different Cloudflare account', () => {
  assert.equal(
    hostedStagingResourcesSchema.safeParse({
      ...resources,
      databaseProjectRef: resources.productionDatabaseProjectRef,
    }).success,
    false
  );
  const production = {
    accountId: resources.accountId,
    worker: 'panamia-next',
    kvNamespaceIds: ['c'.repeat(32)],
    bucketNames: ['panamia-media', 'panamia-chat-private'],
  };
  stagingResourceBoundary(resources, production);
  assert.throws(() =>
    stagingResourceBoundary(
      { ...resources, kvNamespaceId: 'c'.repeat(32) },
      production
    )
  );
  assert.throws(() =>
    stagingResourceBoundary(
      { ...resources, accountId: 'd'.repeat(32) },
      production
    )
  );
});

test('staging admission requires a bounded, explicit set of individual test-account identities', () => {
  const user = randomUUID();
  const descriptor = {
    version: 1,
    environment: 'staging',
    worker: 'panamia-staging',
    origin: resources.origin,
    databaseProjectRef: resources.databaseProjectRef,
    sourceCommit: 'a'.repeat(40),
    allowedUserIds: [user],
  };
  assert.equal(
    hostedStagingDescriptorSchema.safeParse(descriptor).success,
    true
  );
  for (const allowedUserIds of [[], [user, user], ['not-an-account-id']]) {
    assert.equal(
      hostedStagingDescriptorSchema.safeParse({ ...descriptor, allowedUserIds })
        .success,
      false
    );
  }
});

test('hosted messaging permits its mutations but not payments, email migration, public publishing or following remote actors', () => {
  for (const route of [
    '/api/social/encryption/devices',
    '/api/social/encryption/media/file',
    '/api/social/groups/test/join',
    '/api/social/groups/test/members/member',
    '/api/auth/sign-out',
    '/api/social/dm-requests',
    '/api/social/messages/conversations',
    '/api/social/messages/conversations/thread',
  ])
    assert.equal(stagingMutationAllowed(route, 'POST'), true);
  for (const route of [
    '/api/articles/test/publish',
    '/api/social/actors/remote/follow',
    '/api/user/request-email-migration',
    '/api/billing/checkout',
    '/api/social/media',
    '/api/social/conversations',
  ])
    assert.equal(stagingMutationAllowed(route, 'POST'), false);
});

test('hosted config binds only staging resources and subprocesses cannot inherit production credentials', () => {
  const source = JSON.stringify({
    name: 'panamia-next',
    account_id: resources.accountId,
    compatibility_date: '2026-02-24',
    compatibility_flags: ['nodejs_compat'],
    kv_namespaces: [{ id: 'c'.repeat(32) }],
    r2_buckets: [
      { bucket_name: 'panamia-media' },
      { bucket_name: 'panamia-chat-private' },
    ],
    send_email: [{ name: 'EMAIL' }],
    services: [{ binding: 'RELAY', service: 'production' }],
    vars: { PRODUCTION_SECRET: 'must-not-copy' },
  });
  const config = hostedStagingConfig(source, resources, 'a'.repeat(40));
  assertBuiltStagingConfig(config, resources, 'a'.repeat(40));
  for (const changed of [
    { ...config, name: 'panamia-next' },
    { ...config, vars: { ...config.vars, POSTGRES_URL: 'production-secret' } },
    { ...config, services: [{ binding: 'RELAY', service: 'production' }] },
    { ...config, routes: [{ pattern: 'panamia.club' }] },
  ]) {
    assert.throws(() =>
      assertBuiltStagingConfig(changed, resources, 'a'.repeat(40))
    );
  }
  assert.equal(config.main, 'worker/staging.ts');
  assert.equal(config.vars.NEXT_PUBLIC_HOSTED_STAGING, '1');
  for (const forbidden of [
    'must-not-copy',
    '"send_email"',
    '"services"',
    '"POSTGRES_URL"',
    '"BETTER_AUTH_SECRET"',
  ]) {
    assert.equal(JSON.stringify(config).includes(forbidden), false);
  }
  const env = hostedStagingProcessEnv(
    config,
    {
      databaseUrl: 'staging-only',
      authSecret: 'staging-only',
    },
    'private-home',
    {
      NODE_ENV: 'production',
      PATH: 'tools',
      POSTGRES_URL: 'production',
      CLOUDFLARE_API_TOKEN: 'production',
      GOOGLE_CLIENT_SECRET: 'production',
      GH_TOKEN: 'github',
    }
  );
  assert.equal(env.POSTGRES_URL, 'staging-only');
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GOOGLE_CLIENT_SECRET, undefined);
  assert.equal(env.CAPACITOR_SERVER_URL, resources.origin);
});

test('hosted migrations commit their journal entry with their SQL and never put passwords in arguments', () => {
  const database = new URL(
    `postgres://postgres:synthetic-password@db.${resources.databaseProjectRef}.supabase.co:5432/postgres`
  );
  const args = hostedMigrationArguments(
    database,
    'migration.sql',
    'a'.repeat(64),
    1_700_000_000_000
  );
  assert.ok(args.includes('--single-transaction'));
  assert.ok(args.includes('--set=ON_ERROR_STOP=1'));
  assert.ok(args.indexOf('--command') > args.indexOf('--file'));
  assert.match(
    args[args.length - 1],
    /^INSERT INTO drizzle\.__drizzle_migrations /
  );
  assert.equal(args.join(' ').includes('synthetic-password'), false);
  assert.throws(() =>
    hostedMigrationArguments(database, 'migration.sql', 'invalid-hash', 1)
  );
  assert.throws(() =>
    hostedMigrationArguments(database, 'migration.sql', 'a'.repeat(64), 1.5)
  );
});

test('staging native links use their separate application scheme and never admit production hosts', () => {
  const original = process.env.NEXT_PUBLIC_HOSTED_STAGING;
  try {
    process.env.NEXT_PUBLIC_HOSTED_STAGING = '1';
    assert.equal(getMobileAppId(), STAGING_MOBILE_APP_ID);
    const mobile = `${resources.origin}/signin/mobile?token=test-token`;
    const app = mobileMagicLinkAppUrl(mobile);
    assert.match(app, /^social\.pana\.app\.staging:/);
    assert.match(
      mobileMagicLinkIntentUrl(mobile),
      /package=social\.pana\.app\.staging/
    );
    assert.equal(nativeDeepLinkUrl(app, resources.origin)?.href, mobile);
    assert.equal(
      nativeDeepLinkUrl('https://panamia.club/messages', resources.origin),
      null
    );
    process.env.NEXT_PUBLIC_HOSTED_STAGING = '0';
    assert.equal(getMobileAppId(), MOBILE_APP_ID);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_HOSTED_STAGING;
    else process.env.NEXT_PUBLIC_HOSTED_STAGING = original;
  }
});

test('the hosted operator command cannot substitute production credentials when staging access is missing', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'hosted-staging-guard-test-')
  );
  try {
    const filename = path.join(directory, 'resources.json');
    await writeFile(
      filename,
      JSON.stringify({
        ...resources,
        accountId: '99a70a6ec57b862e51035de6fd126cea',
      })
    );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        path.resolve('scripts', 'hosted-staging.ts'),
        'validate',
        '--resources',
        filename,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          POSTGRES_URL: 'PRODUCTION_DATABASE_MUST_NOT_BE_USED',
          BETTER_AUTH_SECRET: 'PRODUCTION_AUTH_MUST_NOT_BE_USED',
          STAGING_POSTGRES_URL: undefined,
          STAGING_BETTER_AUTH_SECRET: undefined,
          STAGING_CLOUDFLARE_API_TOKEN: undefined,
        },
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing STAGING_POSTGRES_URL/);
    assert.equal(
      (result.stdout + result.stderr).includes(
        'PRODUCTION_DATABASE_MUST_NOT_BE_USED'
      ),
      false
    );
    assert.equal(
      (result.stdout + result.stderr).includes(
        'PRODUCTION_AUTH_MUST_NOT_BE_USED'
      ),
      false
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});
