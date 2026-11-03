import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import {
  getEmail,
  sendEmail,
  sendTemplateEmail,
  type SendEmail,
} from '@/lib/email';
import { renderTemplate } from '@/lib/email-templates';
import { button, emailLayout, escape } from '@/lib/email-templates/layout';

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
  test('reminders cannot treat a development log as confirmed email delivery', async () => {
    process.env.EMAIL_ENV = 'DEV';
    await assert.rejects(
      sendTemplateEmail(
        'listing.refresh',
        {
          businessName: 'A Bakery',
          reviewUrl: 'https://panamia.club/listings/review?id=test',
          stopUrl:
            'https://panamia.club/listings/reminders/stop?cycleId=test#token=fixture',
        },
        'owner@example.test',
        { requireDelivery: true }
      ),
      /delivery is disabled/
    );
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

describe('listing email presentation on the real transport path', () => {
  const name = 'Art & Makers <studio> "South"';
  const params = {
    businessName: name,
    requesterEmail: 'manager+studio@example.invalid',
    reviewUrl:
      'https://preview.invalid/listings/invite?id=business&source=notice#token=fixture-proof',
    stopUrl:
      'https://preview.invalid/listings/reminders/stop?cycleId=cycle&source=notice#token=fixture-proof',
    claimUrl:
      'https://preview.invalid/listings/claim?token=fixture-proof&id=business',
    signInUrl:
      'https://preview.invalid/api/auth/magic-link/verify?token=fixture-proof&callbackURL=%2Flistings%2Fsetup',
    setupUrl: 'https://preview.invalid/listings/setup?id=business',
    deadline: '2027-05-18',
    deliveryId: 'fixture-delivery',
  };
  const cases = [
    { name: 'initial notice', template: 'listing.refresh', flags: {} },
    {
      name: 'weekly reminder',
      template: 'listing.refresh',
      flags: { reminderNotice: true },
    },
    {
      name: 'final notice',
      template: 'listing.refresh',
      flags: { reminderNotice: true, finalNotice: true },
    },
    { name: 'claim verification', template: 'listing.claim', flags: {} },
    { name: 'business setup', template: 'listing.setup', flags: {} },
  ] as const;

  for (const entry of cases) {
    test(`${entry.name} sends the registered branded HTML and plain text unchanged`, async () => {
      const fixture = { ...params, ...entry.flags };
      const rendered = renderTemplate(entry.template, fixture);
      await sendTemplateEmail(
        entry.template,
        fixture,
        'manager@example.invalid',
        { requireDelivery: true, replyTo: 'support@example.invalid' }
      );

      assert.deepEqual(messages, [
        {
          to: 'manager@example.invalid',
          from: 'Pana MIA <hola@panamia.club>',
          ...rendered,
          replyTo: 'support@example.invalid',
        },
      ]);
      for (const color of [
        '#fff7ec',
        '#110d0d',
        '#303e8c',
        '#f28444',
        '#fbf7d2',
      ]) {
        assert.ok(rendered.html.includes(color), `missing ${color}`);
      }
      assert.match(
        rendered.html,
        /src="https:\/\/panamia\.club\/logos\/pana_logo_long_orange\.png" alt="PanaMia" width="190" height="32"/
      );
      assert.match(
        rendered.html,
        /<meta name="referrer" content="no-referrer">/
      );
      assert.match(rendered.html, /width:100%;max-width:600px/);
      assert.match(rendered.html, /<!--\[if mso\]><table width="600"/);
      assert.match(rendered.html, /mso-padding-alt:16px 24px/);
      assert.match(rendered.html, /@media screen and \(max-width:600px\)/);
      assert.ok(rendered.html.includes(escape(name)));
      assert.doesNotMatch(rendered.html, /<studio>|&amp;amp; Makers/);
      assert.doesNotMatch(
        rendered.html,
        /#f3f4f6|#4ab3ea|<script\b|<svg\b|<link\b|fonts\.googleapis|javascript:/
      );
      assert.ok(rendered.text.includes(name));
      assert.ok(rendered.subject.includes(name));
      assert.match(
        rendered.text,
        /PanaMia - panamia\.club - hola@panamia\.club/
      );
    });
  }

  test('claim verification keeps the requesting account, one-hour expiry and ignore safety in both formats', () => {
    const rendered = renderTemplate('listing.claim', params);
    for (const copy of [
      params.requesterEmail,
      'use the same Pana account',
      'The link works once and expires in an hour.',
      'it does not change your personal login.',
      'ignore this email and nothing changes.',
      'Whoever asked cannot get access without this link.',
      '"Confirm business information"',
    ]) {
      assert.ok(rendered.html.includes(escape(copy)));
      assert.ok(rendered.text.includes(copy));
    }
    assert.ok(rendered.html.includes(`href="${escape(params.claimUrl)}"`));
    assert.ok(rendered.text.includes(params.claimUrl));
    assert.doesNotMatch(rendered.html, /seven days/);
  });

  test('setup keeps explicit ownership, separate staff approval and optional expired-link recovery', () => {
    for (const setupUrl of [undefined, params.setupUrl]) {
      const rendered = renderTemplate('listing.setup', {
        ...params,
        setupUrl,
      });
      for (const copy of [
        'Opening the link does not assign ownership.',
        'You will confirm on the setup page.',
        'Staff approval is separate',
        'The sign-in link expires shortly',
        'If you did not request this listing, ignore this email.',
      ]) {
        assert.ok(rendered.html.includes(escape(copy)));
        assert.ok(rendered.text.includes(copy));
      }
      assert.ok(rendered.html.includes(`href="${escape(params.signInUrl)}"`));
      assert.ok(rendered.text.includes(params.signInUrl));
      assert.equal(
        rendered.html.includes('Continue business setup'),
        Boolean(setupUrl)
      );
      assert.equal(rendered.text.includes('Continue setup'), Boolean(setupUrl));
      if (setupUrl) {
        assert.ok(rendered.html.includes(`href="${escape(setupUrl)}"`));
        assert.ok(rendered.text.includes(setupUrl));
      }
    }
  });

  test('listing layout and buttons escape raw titles, preheaders, labels and URL attributes once', () => {
    const value = 'A & B <img src=x onerror="bad()"> \'Studio\'';
    const url =
      'https://preview.invalid/review?id=a&next="><img src=x>#token=fixture';
    const rendered = emailLayout({
      variant: 'listing',
      title: value,
      preheader: value,
      body: button(value, url, 'listing'),
    });
    assert.ok(rendered.includes(`<title>${escape(value)}</title>`));
    assert.ok(rendered.includes(`href="${escape(url)}"`));
    assert.equal(rendered.split(escape(value)).length - 1, 3);
    assert.doesNotMatch(rendered, /<img src=x|&amp;amp;/);
  });

  test('unrelated templates retain the default legacy layout and button contract', () => {
    const rendered = emailLayout({
      title: 'Ordinary email',
      preheader: 'A & B',
      body: button('Continue', 'https://preview.invalid/continue'),
    });
    assert.match(rendered, /background-color: #f3f4f6/);
    assert.match(rendered, /border-bottom: 3px solid #4ab3ea/);
    assert.match(rendered, />Pana MIA<\/h1>/);
    assert.match(rendered, /background-color: #ec4899; color: #ffffff/);
    assert.match(rendered, /A &amp; B/);
    assert.doesNotMatch(rendered, /pana_logo_long|listing-shell|#fff7ec/);
  });
});
