import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmail, sendEmail } from '../lib/email';
import { crosspostArticle, getRelay } from '../lib/relay/crosspost-client';

test('hosted staging cannot send email even if a real-delivery binding is accidentally present', async () => {
  const originalFlag = process.env.NEXT_PUBLIC_HOSTED_STAGING;
  const originalMode = process.env.EMAIL_ENV;
  let calls = 0;
  getEmail({
    EMAIL: {
      send: async () => {
        calls++;
      },
    },
  });
  try {
    process.env.EMAIL_ENV = 'PROD';
    process.env.NEXT_PUBLIC_HOSTED_STAGING = '1';
    await assert.rejects(
      sendEmail('test@example.invalid', 'Synthetic', '<p>test</p>'),
      /disabled in hosted staging/
    );
    assert.equal(calls, 0);
    process.env.NEXT_PUBLIC_HOSTED_STAGING = '0';
    await sendEmail('test@example.invalid', 'Synthetic', '<p>test</p>');
    assert.equal(calls, 1);
  } finally {
    if (originalFlag === undefined)
      delete process.env.NEXT_PUBLIC_HOSTED_STAGING;
    else process.env.NEXT_PUBLIC_HOSTED_STAGING = originalFlag;
    if (originalMode === undefined) delete process.env.EMAIL_ENV;
    else process.env.EMAIL_ENV = originalMode;
    getEmail({});
  }
});

test('hosted relay calls fail explicitly rather than use an accidentally inherited production token/binding', async () => {
  const original = process.env.NEXT_PUBLIC_HOSTED_STAGING;
  let calls = 0;
  process.env.NEXT_PUBLIC_HOSTED_STAGING = '0';
  getRelay({
    RELAY: {
      fetch: async () => {
        calls++;
        return Response.json({});
      },
    },
    CROSSPOST_AUTH_TOKEN: 'synthetic-not-a-real-token',
  });
  try {
    process.env.NEXT_PUBLIC_HOSTED_STAGING = '1';
    await assert.rejects(
      crosspostArticle({
        slug: 'test',
        title: 'Synthetic',
        summary: 'Synthetic',
        content: 'Synthetic',
        tags: [],
      }),
      /disabled in hosted staging/
    );
    assert.equal(calls, 0);
  } finally {
    getRelay({});
    if (original === undefined) delete process.env.NEXT_PUBLIC_HOSTED_STAGING;
    else process.env.NEXT_PUBLIC_HOSTED_STAGING = original;
  }
});
