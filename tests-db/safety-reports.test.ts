import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import * as schema from '@/lib/schema';
import type { ContactSubmissionForEmail } from '@/lib/server/contact-notify';

const pg = new PGlite();
const db = drizzle(pg, { schema });
let reporterId: string | null = null;
const notifications: ContactSubmissionForEmail[] = [];
const receipts: {
  template: string;
  params: Record<string, unknown>;
  to: string;
}[] = [];
const upload = mock.fn(async () => 'https://media.example/screenshot.png');
const removeUpload = mock.fn(async () => undefined);

mock.module(import.meta.resolve('../lib/db.ts'), { exports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  exports: {
    auth: async () => (reporterId ? { user: { id: reporterId } } : null),
  },
});
mock.module(import.meta.resolve('../lib/blob/api.ts'), {
  exports: { uploadFile: upload, deleteFile: removeUpload },
});
mock.module(import.meta.resolve('../lib/turnstile.ts'), {
  exports: {
    verifyTurnstile: async (token: string) => token === 'valid-test-token',
  },
});
mock.module(import.meta.resolve('../lib/email.ts'), {
  exports: {
    sendTemplateEmail: async (
      template: string,
      params: Record<string, unknown>,
      to: string
    ) => {
      receipts.push({ template, params, to });
    },
  },
});
mock.module(import.meta.resolve('../lib/server/contact-notify.ts'), {
  exports: {
    notifyStaffOfContactSubmission: async (
      submission: ContactSubmissionForEmail
    ) => {
      notifications.push(submission);
    },
  },
});
const { POST } = await import('../app/api/bug-reports/route');
const { POST: contactPost } = await import('../app/api/createContactUs/route');

before(async () => {
  await pg.exec(
    "CREATE TYPE contact_submission_category AS ENUM ('general', 'membership', 'press', 'technical', 'other')"
  );
  await pg.exec(
    await readFile(
      new URL('../drizzle/0077_safety_reports.sql', import.meta.url),
      'utf8'
    )
  );
  for (const table of [schema.users, schema.contactSubmissions]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${
          column.name === 'category'
            ? 'contact_submission_category'
            : column.enumValues
              ? 'text'
              : column.getSQLType()
        }${column.primary ? ' PRIMARY KEY' : ''}${column.name === 'status' ? " DEFAULT 'open'" : ''}`
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
});

beforeEach(async () => {
  reporterId = null;
  notifications.length = 0;
  receipts.length = 0;
  upload.mock.resetCalls();
  removeUpload.mock.resetCalls();
  await db.delete(schema.contactSubmissions);
  await db.delete(schema.users);
});

after(async () => {
  await pg.close();
  mock.restoreAll();
});

function report(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    reportType: 'safety',
    name: 'Safety Test Reporter',
    email: 'REPORTER@example.com',
    message: 'A clearly marked test report; there is no real incident.',
    pageUrl: 'https://panamia.club/s',
    targetType: 'content',
    targetUrl: 'https://panamia.club/p/example/post-one',
    reason: 'child_safety',
    turnstileToken: 'valid-test-token',
    ...fields,
  }))
    form.set(key, value);
  return form;
}

function request(form: FormData, origin = 'https://panamia.club') {
  return new NextRequest('https://panamia.club/api/bug-reports', {
    method: 'POST',
    headers: { origin, 'user-agent': 'Test browser' },
    body: form,
  });
}

test('persists an attachment-free safety report in the private, filterable support queue', async () => {
  const response = await POST(request(report()));
  assert.equal(response.status, 200);
  const row = await db.query.contactSubmissions.findFirst();
  assert.ok(row);
  assert.equal(row.category, 'safety');
  assert.equal(row.status, 'open');
  assert.equal(row.email, 'reporter@example.com');
  assert.equal(row.userId, null);
  assert.equal(row.screenname, null);
  assert.equal(row.screenshotUrl, null);
  assert.equal(row.userAgent, null);
  assert.equal(row.viewport, null);
  assert.match(
    row.message ?? '',
    /Reason: Child safety or sexual exploitation/
  );
  assert.match(
    row.message ?? '',
    /Reported URL: https:\/\/panamia\.club\/p\/example\/post-one/
  );
  assert.equal(notifications[0]?.id, row.id);
  assert.equal(notifications[0]?.category, 'safety');
  assert.equal(notifications[0]?.isAuthenticated, false);
  assert.equal(receipts[0]?.to, 'reporter@example.com');
  assert.doesNotMatch(
    String(receipts[0]?.params.message),
    /post-one|no real incident/
  );
  assert.equal(upload.mock.callCount(), 0);
});

test('uses server-side reporter identity and preserves the exact reported message reference', async () => {
  await db.insert(schema.users).values({
    id: 'real-reporter',
    email: 'member@example.com',
    screenname: 'real-member',
  });
  reporterId = 'real-reporter';
  const response = await POST(
    request(
      report({
        userId: 'pretend-admin',
        screenname: 'pretend-founder',
        targetUrl:
          'https://panamia.club/messages?conversation=someone#message-one',
        targetType: 'user',
        reason: 'harassment',
      })
    )
  );
  assert.equal(response.status, 200);
  const row = await db.query.contactSubmissions.findFirst();
  assert.equal(row?.userId, 'real-reporter');
  assert.equal(row?.screenname, 'real-member');
  assert.match(row?.message ?? '', /conversation=someone#message-one/);
  assert.equal(notifications[0]?.isAuthenticated, true);
});

test('rejects invalid reasons, target types and URLs before writing or notifying', async () => {
  const invalidFields: Record<string, string>[] = [
    { reason: 'constructor' },
    { targetType: 'admin' },
    { targetUrl: 'javascript:alert(1)' },
    { targetUrl: 'https://user:password@example.com/post' },
    { pageUrl: 'https://user:password@example.com/source' },
    { targetUrl: '' },
    { reportType: 'unrecognized' },
    { message: 'short' },
    { email: 'not-an-email' },
    { name: 'x' },
  ];
  for (const fields of invalidFields) {
    assert.equal((await POST(request(report(fields)))).status, 400);
  }
  assert.equal((await db.select().from(schema.contactSubmissions)).length, 0);
  assert.equal(notifications.length, 0);
  assert.equal(upload.mock.callCount(), 0);
});

test('also keeps safety inquiries sent through Contact Us out of receipt emails', async () => {
  const response = await contactPost(
    new NextRequest('https://panamia.club/api/createContactUs', {
      method: 'POST',
      headers: {
        origin: 'https://panamia.club',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Safety Test Reporter',
        email: 'reporter@example.com',
        message: 'A private, synthetic safety concern for a test.',
        category: 'safety',
        turnstileToken: 'valid-test-token',
      }),
    })
  );
  assert.equal(response.status, 200);
  const row = await db.query.contactSubmissions.findFirst();
  assert.equal(row?.category, 'safety');
  assert.match(row?.message ?? '', /synthetic safety concern/);
  assert.equal(notifications[0]?.id, row?.id);
  assert.doesNotMatch(
    String(receipts[0]?.params.message),
    /synthetic safety concern/
  );
  assert.equal(upload.mock.callCount(), 0);
});

test('rejects safety-report attachments regardless of the form field name or file size', async () => {
  for (const field of ['screenshot', 'attachment']) {
    for (const text of ['', 'synthetic test data only']) {
      const form = report();
      form.set(field, new File([text], 'test.png', { type: 'image/png' }));
      assert.equal((await POST(request(form))).status, 400);
    }
  }
  assert.equal((await db.select().from(schema.contactSubmissions)).length, 0);
  assert.equal(upload.mock.callCount(), 0);
});

test('requires a valid verification token and rejects cross-origin reports', async () => {
  assert.equal(
    (await POST(request(report({ turnstileToken: '' })))).status,
    400
  );
  assert.equal(
    (await POST(request(report({ turnstileToken: 'invalid' })))).status,
    400
  );
  assert.equal(
    (await POST(request(report(), 'https://other.example'))).status,
    403
  );
  assert.equal((await db.select().from(schema.contactSubmissions)).length, 0);
});

test('preserves legacy bug-report screenshot and diagnostic behavior', async () => {
  const form = report({ viewport: '390x844', locale: 'en-US' });
  form.delete('reportType');
  form.delete('targetType');
  form.delete('targetUrl');
  form.delete('reason');
  form.set(
    'screenshot',
    new File(['test image'], 'test.png', { type: 'image/png' })
  );
  const response = await POST(request(form));
  assert.equal(response.status, 200);
  const row = await db.query.contactSubmissions.findFirst();
  assert.equal(row?.category, 'technical');
  assert.equal(row?.screenshotUrl, 'https://media.example/screenshot.png');
  assert.equal(row?.viewport, '390x844');
  assert.match(row?.userAgent ?? '', /Test browser/);
  assert.equal(upload.mock.callCount(), 1);
});

test('does not acknowledge or leak a report when storage fails', async (t) => {
  t.mock.method(db, 'insert', () => {
    throw new Error('private report text must not be logged');
  });
  const log = t.mock.method(console, 'error', () => undefined);
  const response = await POST(request(report()));
  assert.equal(response.status, 500);
  assert.equal(notifications.length, 0);
  assert.equal(receipts.length, 0);
  assert.doesNotMatch(JSON.stringify(log.mock.calls), /private report text/);
  assert.doesNotMatch(await response.text(), /private report text/);
});
