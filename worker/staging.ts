import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import application from './index';
import { db, runWithDb } from '../lib/db';
import { resolveUserIdFromHeaders } from '../auth';
import { users, verification } from '../lib/schema';
import {
  HOSTED_STAGING_WORKER,
  hostedStagingDescriptorSchema,
  isHostedStagingBuild,
  stagingDatabaseUrl,
  stagingMutationAllowed,
  stagingOrigin,
  type HostedStagingDescriptor,
} from '../lib/staging-contract';

export { SignalingRoom, DmStream } from './index';

type Env = Parameters<typeof application.fetch>[1];

const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Pana-Environment': 'staging',
};

function refusal(status: number, code: string, error: string) {
  return Response.json(
    { success: false, code, error },
    {
      status,
      headers: responseHeaders,
    }
  );
}

async function descriptor(): Promise<HostedStagingDescriptor> {
  const rows: unknown = await db.execute(sql`
    SELECT descriptor FROM pana_staging.environment WHERE id = 1
  `);
  const result = z
    .array(
      z.object({
        descriptor: hostedStagingDescriptorSchema,
      })
    )
    .length(1)
    .parse(rows)[0].descriptor;
  if (
    result.worker !== HOSTED_STAGING_WORKER ||
    result.origin !== process.env.NEXT_PUBLIC_HOST_URL ||
    result.databaseProjectRef !== process.env.NEXT_PUBLIC_STAGING_PROJECT_REF ||
    result.sourceCommit !== process.env.NEXT_PUBLIC_STAGING_SOURCE_SHA
  ) {
    throw new Error(
      'The dedicated staging database marker does not match this build.'
    );
  }
  return result;
}

async function allowedInvitation(url: URL, policy: HostedStagingDescriptor) {
  const token = url.searchParams.get('token');
  if (
    !token ||
    url.searchParams.getAll('token').length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    return false;
  const row = await db.query.verification.findFirst({
    where: eq(verification.identifier, `magic-link:${token}`),
    columns: { value: true, expiresAt: true },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return false;
  const value = z
    .object({
      type: z.literal('magic-link'),
      email: z.string().email().endsWith('@e2ee-staging.invalid'),
    })
    .strict()
    .safeParse(JSON.parse(row.value));
  if (!value.success) return false;
  const user = await db.query.users.findFirst({
    where: eq(users.email, value.data.email),
    columns: { id: true },
  });
  return !!user && policy.allowedUserIds.includes(user.id);
}

function stagingLoginPage() {
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private Pana staging</title></head>
<body><main><h1>Private Pana staging</h1><p>This environment contains synthetic test accounts, not real members or conversations.</p><p>Ask the staging operator for a five-minute, single-use invitation. Public signup, email delivery and production integrations are disabled.</p></main></body></html>`,
    {
      headers: {
        ...responseHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    }
  );
}

async function deliver(request: Request, env: Env) {
  const response = await application.fetch(request, env);
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(responseHeaders)) {
    result.headers.set(name, value);
  }
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (
        !isHostedStagingBuild() ||
        !env.POSTGRES_URL ||
        env.HYPERDRIVE ||
        env.EMAIL ||
        env.RELAY ||
        env.CROSSPOST_AUTH_TOKEN
      ) {
        throw new Error(
          'Staging requires its dedicated build and isolated bindings.'
        );
      }
      const origin = stagingOrigin(process.env.NEXT_PUBLIC_HOST_URL ?? '');
      if (
        url.origin !== origin.origin ||
        request.headers.get('host') !== origin.host
      ) {
        return refusal(
          421,
          'STAGING_ORIGIN_REQUIRED',
          'This request is not on the staging origin.'
        );
      }
      const projectRef = z
        .string()
        .regex(/^[a-z0-9]{20}$/)
        .parse(process.env.NEXT_PUBLIC_STAGING_PROJECT_REF);
      const database = stagingDatabaseUrl(env.POSTGRES_URL, {
        databaseProjectRef: projectRef,
      });
      if (database.searchParams.get('sslmode') !== 'verify-full') {
        throw new Error(
          'Hosted staging database connections must verify TLS certificates.'
        );
      }
      return await runWithDb(env, async () => {
        const policy = await descriptor();
        if (url.pathname === '/__staging/health' && request.method === 'GET') {
          return Response.json(
            {
              environment: 'staging',
              sourceCommit: policy.sourceCommit,
            },
            { headers: responseHeaders }
          );
        }
        if (url.pathname === '/signin' && request.method === 'GET') {
          return stagingLoginPage();
        }
        if (
          ['/api/auth/magic-link/verify', '/signin/mobile'].includes(
            url.pathname
          ) &&
          request.method === 'GET'
        ) {
          if (!(await allowedInvitation(url, policy))) {
            return refusal(
              403,
              'STAGING_INVITATION_REQUIRED',
              'A current operator-issued test invitation is required.'
            );
          }
          return deliver(request, env);
        }
        const userId = await resolveUserIdFromHeaders(request.headers);
        if (!userId || !policy.allowedUserIds.includes(userId)) {
          if (
            url.pathname === '/api/auth/get-session' &&
            request.method === 'GET'
          ) {
            return Response.json(null, { headers: responseHeaders });
          }
          if (
            url.pathname.startsWith('/api/') ||
            url.pathname.startsWith('/ws/')
          ) {
            return refusal(
              401,
              'STAGING_ACCOUNT_REQUIRED',
              'An invited staging test account is required.'
            );
          }
          const target = new URL('/signin', origin);
          return new Response(null, {
            status: 303,
            headers: { ...responseHeaders, Location: target.toString() },
          });
        }
        if (
          /^\/(?:api\/(?:federation|internal|webhooks?|stripe|billing|articles|sms)|r)(?:\/|$)/.test(
            url.pathname
          ) ||
          url.pathname.startsWith('/.well-known/') ||
          url.pathname.startsWith('/ws/signaling') ||
          !stagingMutationAllowed(url.pathname, request.method)
        ) {
          return refusal(
            403,
            'STAGING_FEATURE_DISABLED',
            'This integration is disabled in the messaging test environment.'
          );
        }
        if (
          url.pathname === '/api/social/statuses' &&
          request.method === 'POST'
        ) {
          const body: unknown = await request.clone().json();
          if (
            typeof body !== 'object' ||
            body === null ||
            !('visibility' in body) ||
            body.visibility !== 'direct'
          ) {
            return refusal(
              403,
              'STAGING_PUBLICATION_DISABLED',
              'Public publishing is disabled in staging.'
            );
          }
        }
        return deliver(request, env);
      });
    } catch (error) {
      console.error('[hosted-staging] refused request', {
        type: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      return refusal(
        503,
        'STAGING_UNAVAILABLE',
        'The isolated staging deployment is unavailable or misconfigured.'
      );
    }
  },
};
