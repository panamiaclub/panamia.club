import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { socialAttachments } from '../lib/schema';

type StoredAttachment = Pick<
  typeof socialAttachments.$inferSelect,
  'id' | 'url' | 'mediaType'
>;

export function r2PublicPrefix(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !/^pub-[a-f0-9]{32}\.r2\.dev$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Expected an HTTPS R2 public bucket URL without a path.');
  }
  return `${url.origin}/`;
}

export async function planMediaUrlRepairs(
  attachments: StoredAttachment[],
  from: string,
  to: string,
  fetcher: typeof fetch = fetch
) {
  const source = r2PublicPrefix(from);
  const target = r2PublicPrefix(to);
  if (source === target) {
    throw new Error('Source and target buckets must be different.');
  }

  const repairs: { id: string; originalUrl: string; url: string }[] = [];
  const checked = new Map<string, { status: number; contentType: string }>();
  let unavailable = 0;

  for (const attachment of attachments) {
    if (
      !attachment.url.startsWith(source) ||
      attachment.url.length === source.length
    ) {
      continue;
    }

    const url = `${target}${attachment.url.slice(source.length)}`;
    let result = checked.get(url);
    if (!result) {
      const response = await fetcher(url, {
        method: 'HEAD',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      result = {
        status: response.status,
        contentType:
          response.headers.get('content-type')?.split(';')[0].trim() ?? '',
      };
      checked.set(url, result);
    }

    // Older objects may still live in the original bucket. Never move their
    // saved links unless the same key is available in the target bucket.
    if (result.status === 404) {
      unavailable++;
      continue;
    }
    if (result.status !== 200) {
      throw new Error(
        `Target bucket returned HTTP ${result.status}; refusing URL repairs.`
      );
    }
    if (
      attachment.mediaType &&
      result.contentType.toLowerCase() !== attachment.mediaType.toLowerCase()
    ) {
      throw new Error(
        'Target object has a different media type; refusing URL repairs.'
      );
    }

    repairs.push({ id: attachment.id, originalUrl: attachment.url, url });
  }

  return { repairs, unavailable };
}

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  });
  if (!values.from || !values.to) {
    throw new Error('--from and --to public bucket URLs are required.');
  }
  const source = r2PublicPrefix(values.from);
  const target = r2PublicPrefix(values.to);
  if (source === target) {
    throw new Error('Source and target buckets must be different.');
  }
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required.');
  }

  const client = postgres(process.env.POSTGRES_URL, {
    prepare: false,
    max: 1,
  });
  const db = drizzle(client);
  try {
    const attachments = await db
      .select({
        id: socialAttachments.id,
        url: socialAttachments.url,
        mediaType: socialAttachments.mediaType,
      })
      .from(socialAttachments)
      .where(sql`left(${socialAttachments.url}, ${source.length}) = ${source}`);
    const { repairs, unavailable } = await planMediaUrlRepairs(
      attachments,
      source,
      target
    );
    console.log(
      `${attachments.length} stored attachment URL(s) checked: ${repairs.length} verified in the target bucket; ${unavailable} unavailable and left unchanged.`
    );

    if (!values.apply) {
      console.log('Dry run only; no database changes.');
      return;
    }

    await db.transaction(async (tx) => {
      for (const repair of repairs) {
        const updated = await tx
          .update(socialAttachments)
          .set({ url: repair.url })
          .where(
            and(
              eq(socialAttachments.id, repair.id),
              eq(socialAttachments.url, repair.originalUrl)
            )
          )
          .returning({ url: socialAttachments.url });
        if (updated.length !== 1 || updated[0].url !== repair.url) {
          throw new Error(
            'An attachment changed during repair; rolling back all URL changes.'
          );
        }
      }
    });
    console.log(`${repairs.length} saved attachment URL(s) repaired.`);
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    console.error(
      'Social media URL repair failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  });
}
