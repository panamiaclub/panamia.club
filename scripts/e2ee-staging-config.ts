import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

const accountSchema = z.object({
  userId: z.string().uuid(),
  profileId: z.string().uuid(),
  actorId: z.string().uuid(),
  email: z.string().email().endsWith('@e2ee-staging.invalid'),
  handle: z.string().regex(/^stage-(check|demo)-(alice|bob|carol)$/),
});

export const stagingStateSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  directory: z.string(),
  postgresBin: z.string(),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceDirty: z.boolean(),
  origin: z.string().url(),
  databaseUrl: z.string(),
  authSecret: z.string().min(43),
  accounts: z.record(z.string(), accountSchema),
  groups: z.record(
    z.string(),
    z.object({
      id: z.string().uuid(),
      actorId: z.string().uuid(),
      handle: z.string(),
    })
  ),
});

export type StagingState = z.infer<typeof stagingStateSchema>;
export type StagingAccount = z.infer<typeof accountSchema>;

export function assertStagingOrigin(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.origin !== value
  ) {
    throw new Error(
      'The isolated pilot requires an exact loopback HTTP origin.'
    );
  }
  return url;
}

export function assertStagingDatabase(value: string): URL {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.port === '5432' ||
    url.username !== 'pana_stage_owner' ||
    !url.password ||
    !/^\/pana_e2ee_stage_[a-f0-9]{12}$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error('Refusing a database outside a managed loopback pilot.');
  }
  return url;
}

export function assertStagingDirectory(directory: string, repository: string) {
  const resolved = path.resolve(directory);
  const relative = path.relative(path.resolve(repository), resolved);
  if (
    !path.isAbsolute(directory) ||
    path.parse(resolved).root.startsWith('\\\\') ||
    !/^e2ee-staging-[a-f0-9-]+$/.test(path.basename(resolved)) ||
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  ) {
    throw new Error(
      'Use a fresh, absolute e2ee-staging-<id> directory outside the repository.'
    );
  }
  return resolved;
}

export async function readStagingState(directory: string) {
  const state = stagingStateSchema.parse(
    JSON.parse(await readFile(path.join(directory, 'pilot.json'), 'utf8'))
  );
  if (path.resolve(state.directory) !== path.resolve(directory)) {
    throw new Error('Pilot ownership does not match this directory.');
  }
  assertStagingOrigin(state.origin);
  assertStagingDatabase(state.databaseUrl);
  return state;
}

const workerSourceSchema = z.object({
  main: z.literal('worker/index.ts'),
  compatibility_date: z.string(),
  compatibility_flags: z.array(z.string()),
});

function stagingVariables(
  state: Pick<StagingState, 'origin' | 'databaseUrl' | 'authSecret'>
) {
  return {
    CHAT_E2EE_ENABLED: '1',
    POSTGRES_URL: state.databaseUrl,
    BETTER_AUTH_SECRET: state.authSecret,
    BETTER_AUTH_URL: state.origin,
    NEXT_PUBLIC_HOST_URL: state.origin,
    FEDERATION_DOMAIN: '127.0.0.1',
    PANAVERSE_COOKIE_DOMAIN: '',
    PANAVERSE_SUBDOMAINS_ENABLED: 'false',
    EMAIL_ENV: 'DEV',
    R2_PUBLIC_URL: `${state.origin}/__unused-public-media`,
    NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED: 'false',
    NEXT_PUBLIC_APPLE_SIGNIN_ENABLED: 'false',
    NEXT_PUBLIC_FACEBOOK_SIGNIN_ENABLED: 'false',
    NEXT_PUBLIC_WIKIMEDIA_SIGNIN_ENABLED: 'false',
    NEXT_PUBLIC_GITHUB_SIGNIN_ENABLED: 'false',
  };
}

export function isolatedWorkerConfig(
  source: string,
  state: Pick<StagingState, 'runId' | 'origin' | 'databaseUrl' | 'authSecret'>
) {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', source);
  if (parsed.error) throw new Error('Cannot parse the source Worker config.');
  const base = workerSourceSchema.parse(parsed.config);
  assertStagingOrigin(state.origin);
  assertStagingDatabase(state.databaseUrl);
  const id = state.runId.replaceAll('-', '').slice(0, 12);
  const cacheId = createHash('sha256')
    .update(`pana-stage:${state.runId}`)
    .digest('hex')
    .slice(0, 32);
  return {
    name: `pana-e2ee-stage-${id}`,
    main: base.main,
    compatibility_date: base.compatibility_date,
    compatibility_flags: base.compatibility_flags,
    workers_dev: false,
    preview_urls: false,
    send_metrics: false,
    assets: { directory: 'dist/client', binding: 'ASSETS' },
    r2_buckets: [
      {
        binding: 'R2_BUCKET',
        bucket_name: `pana-stage-public-${id}`,
        remote: false,
      },
      {
        binding: 'CHAT_E2EE_BUCKET',
        bucket_name: `pana-stage-private-${id}`,
        remote: false,
      },
    ],
    kv_namespaces: [
      {
        binding: 'VINEXT_KV_CACHE',
        id: cacheId,
        preview_id: cacheId,
        remote: false,
      },
    ],
    durable_objects: {
      bindings: [
        { name: 'SIGNALING_ROOM', class_name: 'SignalingRoom' },
        { name: 'DM_STREAM', class_name: 'DmStream' },
      ],
    },
    migrations: [
      { tag: 'v1', new_sqlite_classes: ['SignalingRoom'] },
      { tag: 'v2', new_sqlite_classes: ['DmStream'] },
    ],
    vars: stagingVariables(state),
  };
}

export function isolatedProcessEnv(
  state: StagingState,
  inherited: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
    'CI',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
  ]) {
    if (inherited[key] !== undefined) env[key] = inherited[key];
  }
  const home = path.join(state.directory, 'home');
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'config'),
    LOCALAPPDATA: path.join(home, 'local'),
    XDG_CONFIG_HOME: path.join(home, 'config'),
    WRANGLER_SEND_METRICS: 'false',
    ...stagingVariables(state),
  });
  return env;
}
