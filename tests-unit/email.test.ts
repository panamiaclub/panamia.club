import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import {
  getEmail,
  sendEmail,
  sendTemplateEmail,
  type SendEmail,
} from '@/lib/email';

type EmailMessage = Parameters<SendEmail['send']>[0];

const originalEnv = {
  EMAIL_ENV: process.env.EMAIL_ENV,
  EMAIL_SENDER_ADDRESS: process.env.EMAIL_SENDER_ADDRESS,
  EMAIL_SENDER_NAME: process.env.EMAIL_SENDER_NAME,
};

const messages: EmailMessage[] = [];

beforeEach(() => {
  process.env.EMAIL_ENV = 'PROD';
  delete process.env.EMAIL_SENDER_ADDRESS;
  delete process.env.EMAIL_SENDER_NAME;
  messages.length = 0;
  getEmail({
    EMAIL: {
      send: async (message) => {
        messages.push(message);
      },
    },
  });
  mock.method(console, 'log', () => {});
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  getEmail({});
});

describe('transactional email delivery', () => {
  test('uses the panamia.club sender by default and preserves the message', async () => {
    await sendEmail(
      'member@example.com',
      'Sign in to Pana MIA',
      '<a href="https://panamia.club/signin">Sign in</a>',
      'Sign in at https://panamia.club/signin',
      { replyTo: 'staff@example.com' }
    );

    assert.deepEqual(messages, [
      {
        to: 'member@example.com',
        from: 'Pana MIA <hola@panamia.club>',
        subject: 'Sign in to Pana MIA',
        html: '<a href="https://panamia.club/signin">Sign in</a>',
        text: 'Sign in at https://panamia.club/signin',
        replyTo: 'staff@example.com',
      },
    ]);
  });

  test('honors the configured runtime sender address and name', async () => {
    process.env.EMAIL_SENDER_ADDRESS = 'notifications@example.com';
    process.env.EMAIL_SENDER_NAME = 'Pana Team';

    await sendEmail('member@example.com', 'Welcome', '<p>Welcome</p>');

    assert.deepEqual(messages, [
      {
        to: 'member@example.com',
        from: 'Pana Team <notifications@example.com>',
        subject: 'Welcome',
        html: '<p>Welcome</p>',
      },
    ]);
  });

  test('rejects production sends when the current environment has no binding', async () => {
    getEmail({});

    assert.equal(getEmail(), null);
    await assert.rejects(
      sendEmail('member@example.com', 'Welcome', '<p>Welcome</p>'),
      /Email binding is not available/
    );
    assert.equal(messages.length, 0);
  });

  test('propagates provider failures rather than reporting a sent email', async () => {
    const failure = new Error(
      'could not find account config of sending domain'
    );
    getEmail({
      EMAIL: {
        send: async () => {
          throw failure;
        },
      },
    });

    await assert.rejects(
      sendEmail('member@example.com', 'Welcome', '<p>Welcome</p>'),
      (error: unknown) => error === failure
    );
  });

  test('keeps development sends local, including when EMAIL_ENV is unset', async () => {
    process.env.EMAIL_ENV = 'DEV';
    await sendEmail('member@example.com', 'Welcome', '<p>Welcome</p>');

    delete process.env.EMAIL_ENV;
    await sendEmail('member@example.com', 'Welcome', '<p>Welcome</p>');

    assert.equal(messages.length, 0);
  });
});

describe('transactional email branding', () => {
  for (const template of [
    'profile.submitted',
    'profile.published',
    'profile.not_published',
    'listing.claim',
    'admin.profile_submission',
    'admin.newsletter_submission',
    'admin.contact_submission',
    'admin.affiliate_submission',
  ] as const) {
    test(`${template} uses panamia.club in both email formats`, async () => {
      await sendTemplateEmail(
        template,
        { name: 'Taylor', claimUrl: 'https://panamia.club/claim' },
        'member@example.com'
      );

      assert.equal(messages.length, 1);
      assert.equal(messages[0].from, 'Pana MIA <hola@panamia.club>');
      assert.match(messages[0].html, /href="https:\/\/panamia\.club"/);
      assert.match(messages[0].html, /mailto:hola@panamia\.club/);
      assert.match(messages[0].text ?? '', /panamia\.club/);
      assert.doesNotMatch(messages[0].html, /pana\.social/);
      assert.doesNotMatch(messages[0].text ?? '', /pana\.social/);
    });
  }
});
