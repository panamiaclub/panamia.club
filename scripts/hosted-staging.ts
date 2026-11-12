import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { sql as query } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { z } from 'zod';
import {
  hostedStagingDescriptorSchema,
  hostedStagingResourcesSchema,
  stagingDatabaseUrl,
  type HostedStagingResources,
} from '../lib/staging-contract';
import {
  assertBuiltStagingConfig,
  hostedMigrationArguments,
  hostedStagingConfig,
  hostedStagingProcessEnv,
} from './hosted-staging-config';
import { createStagingSnapshot } from './staging-snapshot';
import { seedStaging } from '../tests-staging/fixtures';

const exec = promisify(execFile);
const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const executable = (name: string) =>
  `${name}${process.platform === 'win32' ? '.exe' : ''}`;

const usage = `Hosted staging (never reads .env.local or production secrets)
  validate --resources <resource-registry.json>
  init     --resources <resource-registry.json>
  build    --resources <resource-registry.json> --directory <absolute hosted-staging-id>
  deploy   --resources <resource-registry.json> --directory <built hosted-staging-id>
  login    --resources <resource-registry.json> --account demo-alice

Required secure environment: STAGING_POSTGRES_URL, STAGING_BETTER_AUTH_SECRET.
Deployment additionally requires STAGING_CLOUDFLARE_API_TOKEN.
Migration additionally requires PostgreSQL 16 psql on PATH or PG_BIN_DIR.
No project or paid resource is created by these commands.`;

function requiredSecret(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Missing ${name}. Configure staging-only access through secure settings; do not supply production credentials.`
    );
  return value;
}

function redact(value: string) {
  for (const name of [
    'STAGING_POSTGRES_URL',
    'STAGING_BETTER_AUTH_SECRET',
    'STAGING_CLOUDFLARE_API_TOKEN',
  ]) {
    const secret = process.env[name];
    if (secret) value = value.replaceAll(secret, '[staging-secret]');
  }
  const database = process.env.STAGING_POSTGRES_URL;
  if (database) {
    try {
      const password = new URL(database).password;
      if (password) {
        value = value.replaceAll(password, '[staging-secret]');
        try {
          value = value.replaceAll(
            decodeURIComponent(password),
            '[staging-secret]'
          );
        } catch {
          // An invalid credential must not break the redactor's error path.
        }
      }
    } catch {
      // The complete malformed URL was already redacted above.
    }
  }
  return value.replace(/([?&]token=)[^&\s"'<>]+/g, '$1[redacted]');
}

async function cleanCommit() {
  const { stdout: dirty } = await exec('git', ['status', '--porcelain'], {
    cwd: repository,
    windowsHide: true,
  });
  if (dirty.trim())
    throw new Error(
      'Hosted deployment requires a clean committed source checkout.'
    );
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    windowsHide: true,
  });
  return z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(stdout.trim());
}

function outputDirectory(value: string) {
  const resolved = path.resolve(value);
  const relative = path.relative(repository, resolved);
  if (
    !path.isAbsolute(value) ||
    path.parse(resolved).root.startsWith('\\\\') ||
    !/^hosted-staging-[a-z0-9-]+$/.test(path.basename(resolved)) ||
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  ) {
    throw new Error(
      'Use a fresh absolute hosted-staging-<id> directory outside the repository.'
    );
  }
  return resolved;
}

async function resourcesAt(filename: string) {
  const resources = hostedStagingResourcesSchema.parse(
    JSON.parse(await readFile(filename, 'utf8'))
  );
  hostedStagingConfig(
    await readFile(path.join(repository, 'wrangler.jsonc'), 'utf8'),
    resources,
    'a'.repeat(40)
  );
  return resources;
}

function secretsFor(resources: HostedStagingResources) {
  const database = stagingDatabaseUrl(
    requiredSecret('STAGING_POSTGRES_URL'),
    resources
  );
  database.searchParams.set('sslmode', 'verify-full');
  const authSecret = z
    .string()
    .min(43)
    .parse(requiredSecret('STAGING_BETTER_AUTH_SECRET'));
  return { databaseUrl: database.toString(), authSecret };
}

function connection(resources: HostedStagingResources) {
  const secrets = secretsFor(resources);
  return postgres(secrets.databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    ssl: { rejectUnauthorized: true },
  });
}

async function control(sql: Sql, resources: HostedStagingResources) {
  const [row] = await sql<{ resource: unknown; descriptor: unknown }[]>`
    SELECT resource, descriptor FROM pana_staging.environment WHERE id = 1
  `;
  if (
    !row ||
    JSON.stringify(hostedStagingResourcesSchema.parse(row.resource)) !==
      JSON.stringify(resources)
  ) {
    throw new Error(
      'The database ownership marker does not match the selected staging resources.'
    );
  }
  return hostedStagingDescriptorSchema.parse(row.descriptor);
}

async function initialize(resources: HostedStagingResources) {
  const sourceCommit = await cleanCommit();
  const sql = connection(resources);
  const home = await mkdtemp(
    path.join(os.tmpdir(), 'hosted-staging-migration-')
  );
  try {
    const config = hostedStagingConfig(
      await readFile(path.join(repository, 'wrangler.jsonc'), 'utf8'),
      resources,
      sourceCommit
    );
    const url = stagingDatabaseUrl(
      secretsFor(resources).databaseUrl,
      resources
    );
    const psql = process.env.PG_BIN_DIR
      ? path.join(process.env.PG_BIN_DIR, executable('psql'))
      : executable('psql');
    const env = {
      ...hostedStagingProcessEnv(config, secretsFor(resources), home),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: 'verify-full',
      PGCONNECT_TIMEOUT: '10',
    };
    const { stdout: version } = await exec(psql, ['--version'], {
      env,
      windowsHide: true,
    });
    if (!/\b16\.\d+/.test(version))
      throw new Error('Hosted migrations require PostgreSQL 16 psql.');
    const [lock] = await sql<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtext('pana-hosted-staging-init')) AS acquired
    `;
    if (!lock.acquired)
      throw new Error(
        'Another operator is initializing this staging database.'
      );
    const [existing] = await sql<
      { marker: string | null; ledger: string | null }[]
    >`
      SELECT to_regclass('pana_staging.environment')::text AS marker,
        to_regclass('drizzle.__drizzle_migrations')::text AS ledger
    `;
    if (!existing.marker) {
      const tables = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      if (tables[0].count || existing.ledger) {
        throw new Error(
          'Refusing to initialize a nonempty database without a staging ownership marker.'
        );
      }
      await sql.begin(async (transaction) => {
        await transaction.unsafe(`
          CREATE SCHEMA pana_staging;
          CREATE TABLE pana_staging.environment
            (id INTEGER PRIMARY KEY CHECK (id = 1), resource JSONB NOT NULL, descriptor JSONB);
          CREATE SCHEMA drizzle;
          CREATE TABLE drizzle.__drizzle_migrations
            (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT UNIQUE);
        `);
        await transaction`INSERT INTO pana_staging.environment (id, resource) VALUES (1, ${JSON.stringify(resources)}::jsonb)`;
      });
    } else {
      const [row] = await sql<
        { resource: unknown }[]
      >`SELECT resource FROM pana_staging.environment WHERE id = 1`;
      if (
        JSON.stringify(hostedStagingResourcesSchema.parse(row?.resource)) !==
        JSON.stringify(resources)
      ) {
        throw new Error('Refusing a mismatched staging initialization marker.');
      }
    }
    const journal = z
      .object({
        entries: z.array(
          z.object({
            tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
            when: z.number().int().nonnegative().safe(),
          })
        ),
      })
      .parse(
        JSON.parse(
          await readFile(
            path.join(repository, 'drizzle', 'meta', '_journal.json'),
            'utf8'
          )
        )
      );
    const applied = await sql<{ hash: string; created_at: string }[]>`
      SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
    `;
    if (
      applied.some(
        (entry) =>
          !journal.entries.some(
            (item) => item.when === Number(entry.created_at)
          )
      )
    ) {
      throw new Error(
        'The staging ledger contains migrations outside this committed journal.'
      );
    }
    const known = new Map(
      applied.map((entry) => [Number(entry.created_at), entry.hash])
    );
    for (const entry of journal.entries) {
      const filename = path.join(repository, 'drizzle', `${entry.tag}.sql`);
      const hash = createHash('sha256')
        .update(await readFile(filename))
        .digest('hex');
      if (known.has(entry.when)) {
        if (known.get(entry.when) !== hash)
          throw new Error(`Applied staging migration changed: ${entry.tag}`);
        continue;
      }
      await exec(
        psql,
        hostedMigrationArguments(url, filename, hash, entry.when),
        {
          cwd: repository,
          windowsHide: true,
          env,
          maxBuffer: 8 * 1024 * 1024,
        }
      );
    }
    await drizzle(sql).transaction(async (transaction) => {
      const rows = await transaction.execute(query`
        SELECT descriptor FROM pana_staging.environment WHERE id = 1
      `);
      const previous = z.object({ descriptor: z.unknown() }).parse(rows[0]);
      let allowedUserIds: string[];
      if (previous.descriptor !== null) {
        allowedUserIds = hostedStagingDescriptorSchema.parse(
          previous.descriptor
        ).allowedUserIds;
      } else {
        const fixtures = { origin: resources.origin, accounts: {}, groups: {} };
        await seedStaging(transaction, fixtures);
        const accounts = z
          .record(z.string(), z.object({ userId: z.string().uuid() }))
          .parse(fixtures.accounts);
        allowedUserIds = Object.values(accounts).map(
          (account) => account.userId
        );
      }
      const descriptor = hostedStagingDescriptorSchema.parse({
        version: 1,
        environment: 'staging',
        worker: resources.worker,
        origin: resources.origin,
        databaseProjectRef: resources.databaseProjectRef,
        sourceCommit,
        allowedUserIds,
      });
      await transaction.execute(
        query`UPDATE pana_staging.environment SET descriptor = ${JSON.stringify(descriptor)}::jsonb WHERE id = 1`
      );
    });
    console.log(
      `Initialized only the verified staging project; ${journal.entries.length} journal migrations accounted for.`
    );
  } finally {
    await sql.end({ timeout: 5 });
    await rm(home, { recursive: true });
  }
}

async function cliBin(directory: string, packageName: string, command: string) {
  const root = path.join(directory, 'node_modules', ...packageName.split('/'));
  const pkg = z
    .object({ bin: z.union([z.string(), z.record(z.string(), z.string())]) })
    .parse(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')));
  const relative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[command];
  if (!relative) throw new Error(`Installed command ${command} was not found.`);
  return path.resolve(root, relative);
}

async function build(resources: HostedStagingResources, directory: string) {
  const sourceCommit = await cleanCommit();
  const secrets = secretsFor(resources);
  const sql = connection(resources);
  try {
    const marker = await control(sql, resources);
    if (marker.sourceCommit !== sourceCommit)
      throw new Error(
        'Initialize the staging marker for this exact committed source before building.'
      );
  } finally {
    await sql.end({ timeout: 5 });
  }
  await mkdir(directory);
  const home = path.join(directory, 'home');
  await mkdir(home);
  const config = hostedStagingConfig(
    await readFile(path.join(repository, 'wrangler.jsonc'), 'utf8'),
    resources,
    sourceCommit
  );
  const snapshot = await createStagingSnapshot(repository, directory, config);
  const result = await exec(
    process.execPath,
    [await cliBin(snapshot, 'vinext', 'vinext'), 'build'],
    {
      cwd: snapshot,
      env: hostedStagingProcessEnv(config, secrets, home),
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  await writeFile(
    path.join(directory, 'build.log'),
    redact(result.stdout + result.stderr),
    { mode: 0o600 }
  );
  assertBuiltStagingConfig(
    JSON.parse(
      await readFile(
        path.join(snapshot, 'dist', 'server', 'wrangler.json'),
        'utf8'
      )
    ),
    resources,
    sourceCommit
  );
  await writeFile(
    path.join(directory, 'hosted-build.json'),
    JSON.stringify(
      {
        resources,
        sourceCommit,
        directory,
        wasmSha256: createHash('sha256')
          .update(
            await readFile(
              path.join(
                snapshot,
                'crypto',
                'openmls',
                'pkg',
                'pana_openmls_bg.wasm'
              )
            )
          )
          .digest('hex'),
      },
      null,
      2
    )
  );
  console.log(
    'Built the isolated hosted staging artifact. No deployment occurred.'
  );
}

async function deploy(resources: HostedStagingResources, directory: string) {
  const sourceCommit = await cleanCommit();
  const manifest = z
    .object({
      resources: hostedStagingResourcesSchema,
      sourceCommit: z.string(),
      directory: z.string(),
      wasmSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .parse(
      JSON.parse(
        await readFile(path.join(directory, 'hosted-build.json'), 'utf8')
      )
    );
  if (
    manifest.directory !== directory ||
    manifest.sourceCommit !== sourceCommit ||
    JSON.stringify(manifest.resources) !== JSON.stringify(resources)
  ) {
    throw new Error(
      'The staging artifact does not match this directory, resource registry or source commit.'
    );
  }
  const secrets = {
    ...secretsFor(resources),
    cloudflareToken: requiredSecret('STAGING_CLOUDFLARE_API_TOKEN'),
  };
  const config = hostedStagingConfig(
    await readFile(path.join(repository, 'wrangler.jsonc'), 'utf8'),
    resources,
    sourceCommit
  );
  const snapshot = path.join(directory, 'app');
  assertBuiltStagingConfig(
    JSON.parse(
      await readFile(
        path.join(snapshot, 'dist', 'server', 'wrangler.json'),
        'utf8'
      )
    ),
    resources,
    sourceCommit
  );
  const wasmHash = createHash('sha256')
    .update(
      await readFile(
        path.join(snapshot, 'crypto', 'openmls', 'pkg', 'pana_openmls_bg.wasm')
      )
    )
    .digest('hex');
  if (wasmHash !== manifest.wasmSha256) {
    throw new Error('The qualified staging engine changed after the build.');
  }
  const wrangler = await cliBin(snapshot, 'wrangler', 'wrangler');
  const env = hostedStagingProcessEnv(
    config,
    secrets,
    path.join(directory, 'home')
  );
  const secretFile = path.join(directory, 'runtime-secrets.json');
  await writeFile(
    secretFile,
    JSON.stringify({
      POSTGRES_URL: secrets.databaseUrl,
      BETTER_AUTH_SECRET: secrets.authSecret,
    }),
    { mode: 0o600 }
  );
  try {
    await exec(
      process.execPath,
      [
        wrangler,
        'deploy',
        '--config',
        path.join(snapshot, 'dist', 'server', 'wrangler.json'),
      ],
      { cwd: snapshot, env, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    );
    await exec(
      process.execPath,
      [
        wrangler,
        'secret',
        'bulk',
        secretFile,
        '--name',
        resources.worker,
        '--config',
        path.join(snapshot, 'dist', 'server', 'wrangler.json'),
      ],
      { cwd: snapshot, env, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    );
  } finally {
    await rm(secretFile, { force: true });
  }
  const response = await fetch(`${resources.origin}/__staging/health`, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const health = z
    .object({
      environment: z.literal('staging'),
      sourceCommit: z.literal(sourceCommit),
    })
    .parse(await response.json());
  if (!response.ok || health.sourceCommit !== sourceCommit)
    throw new Error(
      'The hosted staging deployment is not healthy at its approved origin.'
    );
  console.log(
    `Hosted staging is available at ${resources.origin}; production was not deployed.`
  );
}

async function login(resources: HostedStagingResources, account: string) {
  if (!/^demo-(alice|bob)$/.test(account))
    throw new Error(
      'Only an explicitly named manual staging account can receive an invitation.'
    );
  const sql = connection(resources);
  try {
    const marker = await control(sql, resources);
    const [user] = await sql<{ id: string; email: string }[]>`
      SELECT id, email FROM users WHERE screenname = ${`stage-${account}`}
    `;
    if (
      !user ||
      !marker.allowedUserIds.includes(user.id) ||
      !user.email.endsWith('@e2ee-staging.invalid')
    ) {
      throw new Error(
        'Refusing to issue an invitation for a non-staging user.'
      );
    }
    const token = randomBytes(32).toString('base64url');
    await sql`
      INSERT INTO verification_tokens (id, identifier, value, expires_at, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${`magic-link:${token}`},
        ${JSON.stringify({ type: 'magic-link', email: user.email })},
        ${new Date(Date.now() + 5 * 60_000)}, now(), now())
    `;
    const url = new URL('/api/auth/magic-link/verify', resources.origin);
    url.searchParams.set('token', token);
    url.searchParams.set('callbackURL', '/messages');
    console.log(url.toString());
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      resources: { type: 'string' },
      directory: { type: 'string' },
      account: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (!values.resources) throw new Error(usage);
  const resources = await resourcesAt(values.resources);
  const mode = positionals[0];
  if (mode === 'validate') {
    secretsFor(resources);
    console.log(
      'Staging resource and credential identities are valid. No writes occurred.'
    );
  } else if (mode === 'init') {
    await initialize(resources);
  } else if (mode === 'login') {
    await login(resources, values.account ?? 'demo-alice');
  } else if (mode === 'build' || mode === 'deploy') {
    if (!values.directory) throw new Error(usage);
    const directory = outputDirectory(values.directory);
    if (mode === 'build') await build(resources, directory);
    else await deploy(resources, directory);
  } else throw new Error(usage);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
      redact(error instanceof Error ? error.message : String(error))
    );
    process.exitCode = 1;
  });
}
