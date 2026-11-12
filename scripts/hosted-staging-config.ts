import ts from 'typescript';
import { z } from 'zod';
import {
  HOSTED_STAGING_RETENTION_CRON,
  hostedStagingResourcesSchema,
  stagingOrigin,
  stagingResourceBoundary,
  type HostedStagingResources,
} from '../lib/staging-contract';

export function hostedStagingConfig(
  source: string,
  resources: HostedStagingResources,
  sourceCommit: string
) {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', source);
  if (parsed.error)
    throw new Error('Cannot parse the source Worker configuration.');
  const production = z
    .object({
      name: z.string(),
      account_id: z.string().regex(/^[a-f0-9]{32}$/),
      compatibility_date: z.string(),
      compatibility_flags: z.array(z.string()),
      kv_namespaces: z.array(z.object({ id: z.string() })),
      r2_buckets: z.array(z.object({ bucket_name: z.string() })),
    })
    .parse(parsed.config);
  hostedStagingResourcesSchema.parse(resources);
  z.string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(sourceCommit);
  stagingResourceBoundary(resources, {
    accountId: production.account_id,
    worker: production.name,
    kvNamespaceIds: production.kv_namespaces.map((row) => row.id),
    bucketNames: production.r2_buckets.map((row) => row.bucket_name),
  });
  const origin = stagingOrigin(resources.origin);
  const customDomain = origin.hostname === 'staging.panamia.club';
  return {
    name: resources.worker,
    account_id: resources.accountId,
    main: 'worker/staging.ts',
    compatibility_date: production.compatibility_date,
    compatibility_flags: production.compatibility_flags,
    workers_dev: !customDomain,
    preview_urls: false,
    send_metrics: false,
    ...(customDomain
      ? {
          routes: [{ pattern: origin.hostname, custom_domain: true }],
        }
      : {}),
    assets: { directory: 'dist/client', binding: 'ASSETS' },
    r2_buckets: [
      { binding: 'R2_BUCKET', bucket_name: resources.publicBucket },
      { binding: 'CHAT_E2EE_BUCKET', bucket_name: resources.privateBucket },
    ],
    kv_namespaces: [
      { binding: 'VINEXT_KV_CACHE', id: resources.kvNamespaceId },
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
    triggers: { crons: [HOSTED_STAGING_RETENTION_CRON] },
    vars: {
      CHAT_E2EE_ENABLED: '1',
      NEXT_PUBLIC_HOSTED_STAGING: '1',
      NEXT_PUBLIC_STAGING_PROJECT_REF: resources.databaseProjectRef,
      NEXT_PUBLIC_STAGING_SOURCE_SHA: sourceCommit,
      NEXT_PUBLIC_HOST_URL: resources.origin,
      BETTER_AUTH_URL: resources.origin,
      FEDERATION_DOMAIN: origin.hostname,
      PANAVERSE_COOKIE_DOMAIN: '',
      EMAIL_ENV: 'DEV',
      R2_PUBLIC_URL: `${resources.origin}/__unused-public-media`,
      NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED: 'false',
      NEXT_PUBLIC_APPLE_SIGNIN_ENABLED: 'false',
      NEXT_PUBLIC_FACEBOOK_SIGNIN_ENABLED: 'false',
      NEXT_PUBLIC_WIKIMEDIA_SIGNIN_ENABLED: 'false',
      NEXT_PUBLIC_GITHUB_SIGNIN_ENABLED: 'false',
    },
  };
}

export function hostedStagingProcessEnv(
  config: ReturnType<typeof hostedStagingConfig>,
  secrets: {
    databaseUrl: string;
    authSecret: string;
    cloudflareToken?: string;
  },
  privateHome: string,
  inherited: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const name of [
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
    if (inherited[name] !== undefined) env[name] = inherited[name];
  }
  Object.assign(env, config.vars, {
    POSTGRES_URL: secrets.databaseUrl,
    BETTER_AUTH_SECRET: secrets.authSecret,
    CLOUDFLARE_ACCOUNT_ID: config.account_id,
    WRANGLER_SEND_METRICS: 'false',
    HOME: privateHome,
    USERPROFILE: privateHome,
    XDG_CONFIG_HOME: privateHome,
    APPDATA: privateHome,
    LOCALAPPDATA: privateHome,
    CAPACITOR_SERVER_URL: config.vars.NEXT_PUBLIC_HOST_URL,
  });
  if (secrets.cloudflareToken)
    env.CLOUDFLARE_API_TOKEN = secrets.cloudflareToken;
  return env;
}

export function hostedMigrationArguments(
  database: URL,
  filename: string,
  hash: string,
  timestamp: number
) {
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(hash);
  z.number().int().nonnegative().safe().parse(timestamp);
  return [
    '-X',
    '--no-password',
    '--quiet',
    '--single-transaction',
    '-h',
    database.hostname,
    '-p',
    database.port,
    '-U',
    decodeURIComponent(database.username),
    '-d',
    database.pathname.slice(1),
    '--set=ON_ERROR_STOP=1',
    '--file',
    filename,
    '--command',
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${timestamp})`,
  ];
}

export function assertBuiltStagingConfig(
  value: unknown,
  resources: HostedStagingResources,
  sourceCommit: string
) {
  const built = z
    .object({
      name: z.literal(resources.worker),
      account_id: z.literal(resources.accountId),
      vars: z.record(z.string(), z.unknown()),
      r2_buckets: z.array(
        z.object({ binding: z.string(), bucket_name: z.string() })
      ),
      kv_namespaces: z.array(z.object({ binding: z.string(), id: z.string() })),
      services: z.array(z.unknown()).optional(),
      send_email: z.array(z.unknown()).optional(),
      routes: z.array(z.object({ pattern: z.string() })).optional(),
      triggers: z.object({
        crons: z.tuple([z.literal(HOSTED_STAGING_RETENTION_CRON)]),
      }),
    })
    .parse(value);
  if (
    built.vars.NEXT_PUBLIC_HOSTED_STAGING !== '1' ||
    built.vars.NEXT_PUBLIC_HOST_URL !== resources.origin ||
    built.vars.NEXT_PUBLIC_STAGING_PROJECT_REF !==
      resources.databaseProjectRef ||
    built.vars.NEXT_PUBLIC_STAGING_SOURCE_SHA !== sourceCommit ||
    'POSTGRES_URL' in built.vars ||
    'BETTER_AUTH_SECRET' in built.vars ||
    built.services?.length ||
    built.send_email?.length ||
    built.r2_buckets.length !== 2 ||
    !built.r2_buckets.some(
      (bucket) =>
        bucket.binding === 'R2_BUCKET' &&
        bucket.bucket_name === resources.publicBucket
    ) ||
    !built.r2_buckets.some(
      (bucket) =>
        bucket.binding === 'CHAT_E2EE_BUCKET' &&
        bucket.bucket_name === resources.privateBucket
    ) ||
    built.kv_namespaces.length !== 1 ||
    built.kv_namespaces[0].binding !== 'VINEXT_KV_CACHE' ||
    built.kv_namespaces[0].id !== resources.kvNamespaceId ||
    built.routes?.some(
      (route) => route.pattern !== new URL(resources.origin).hostname
    )
  ) {
    throw new Error(
      'The generated Worker artifact does not preserve its staging-only bindings and origin.'
    );
  }
  return built;
}
