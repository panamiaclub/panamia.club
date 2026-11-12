import { z } from 'zod';
import { STAGING_MOBILE_APP_ID } from './mobile/app-identity';

export const HOSTED_STAGING_WORKER = 'panamia-staging';
export const HOSTED_STAGING_APP_ID = STAGING_MOBILE_APP_ID;
export const HOSTED_STAGING_COOKIE_PREFIX = 'pana-staging';
export const HOSTED_STAGING_RETENTION_CRON = '0 * * * *';

const projectRef = z.string().regex(/^[a-z0-9]{20}$/);
const resourceId = z.string().regex(/^[a-f0-9]{32}$/);

export function isHostedStagingBuild() {
  return process.env.NEXT_PUBLIC_HOSTED_STAGING === '1';
}

export function stagingOrigin(value: string): URL {
  const url = new URL(value);
  const allowed =
    url.hostname === 'staging.panamia.club' ||
    /^panamia-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname);
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.origin !== value
  ) {
    throw new Error('An explicitly approved staging HTTPS origin is required.');
  }
  return url;
}

export const hostedStagingResourcesSchema = z
  .object({
    version: z.literal(1),
    environment: z.literal('staging'),
    worker: z.literal(HOSTED_STAGING_WORKER),
    accountId: resourceId,
    origin: z.string(),
    databaseProjectRef: projectRef,
    productionDatabaseProjectRef: projectRef,
    kvNamespaceId: resourceId,
    publicBucket: z.literal('panamia-staging-media'),
    privateBucket: z.literal('panamia-staging-chat-private'),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      stagingOrigin(value.origin);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['origin'],
        message: 'The origin is not an approved staging origin.',
      });
    }
    if (value.databaseProjectRef === value.productionDatabaseProjectRef) {
      context.addIssue({
        code: 'custom',
        path: ['databaseProjectRef'],
        message: 'Staging must use a different database project.',
      });
    }
  });

export type HostedStagingResources = z.infer<
  typeof hostedStagingResourcesSchema
>;

export function stagingDatabaseUrl(
  value: string,
  resources: Pick<HostedStagingResources, 'databaseProjectRef'>
): URL {
  const url = new URL(value);
  const direct =
    url.hostname === `db.${resources.databaseProjectRef}.supabase.co` &&
    url.username === 'postgres';
  const sessionPooler =
    url.hostname.endsWith('.pooler.supabase.com') &&
    url.username === `postgres.${resources.databaseProjectRef}`;
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    (!direct && !sessionPooler) ||
    url.port !== '5432' ||
    !url.password ||
    url.pathname !== '/postgres' ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== 'sslmode') ||
    (url.searchParams.has('sslmode') &&
      !['require', 'verify-full'].includes(
        url.searchParams.get('sslmode') ?? ''
      ))
  ) {
    throw new Error(
      'Refusing a connection outside the explicitly selected staging project.'
    );
  }
  return url;
}

export const hostedStagingDescriptorSchema = z
  .object({
    version: z.literal(1),
    environment: z.literal('staging'),
    worker: z.literal(HOSTED_STAGING_WORKER),
    origin: z.string(),
    databaseProjectRef: projectRef,
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    allowedUserIds: z.array(z.string().uuid()).min(1).max(100),
    access: z.enum(['paused', 'ready']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      stagingOrigin(value.origin);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['origin'],
        message: 'The descriptor origin is not approved.',
      });
    }
    if (new Set(value.allowedUserIds).size !== value.allowedUserIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['allowedUserIds'],
        message: 'Duplicate test-account identities are not permitted.',
      });
    }
  });

export type HostedStagingDescriptor = z.infer<
  typeof hostedStagingDescriptorSchema
>;

export function stagingResourceBoundary(
  resources: HostedStagingResources,
  production: {
    accountId: string;
    worker: string;
    kvNamespaceIds: string[];
    bucketNames: string[];
  }
) {
  hostedStagingResourcesSchema.parse(resources);
  if (
    resources.accountId !== production.accountId ||
    resources.worker === production.worker ||
    production.kvNamespaceIds.includes(resources.kvNamespaceId) ||
    production.bucketNames.includes(resources.publicBucket) ||
    production.bucketNames.includes(resources.privateBucket)
  ) {
    throw new Error(
      'Refusing production or mismatched-account staging bindings.'
    );
  }
}

export function stagingMutationAllowed(pathname: string, method: string) {
  if (method === 'GET' || method === 'HEAD') return true;
  if (pathname.startsWith('/api/social/encryption/')) return true;
  if (pathname === '/api/auth/sign-out') return true;
  if (
    /^\/api\/social\/groups\/[^/]+\/(?:join|members\/[^/]+|chat(?:\/[^/]+)?)$/.test(
      pathname
    )
  )
    return true;
  if (pathname === '/api/social/statuses') return true;
  if (
    /^\/api\/social\/(?:dm-requests|messages\/conversations)(?:\/[^/]+)?$/.test(
      pathname
    )
  )
    return true;
  return false;
}
