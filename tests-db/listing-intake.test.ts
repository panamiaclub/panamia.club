import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const email = 'ana@test.invalid';
const userId = 'ana-account';
const personalId = 'ana-personal-profile';
let session: {
  user: { id: string; email: string; name: string; isAdmin?: boolean };
} | null;
let activeProfileId: string | undefined;
let verificationPasses = true;
let invitationFails = false;
let notificationFails = false;
const invitations: Array<{ email: string; callback: string }> = [];
const emails: Array<{
  template: string;
  variables: Record<string, unknown>;
  recipient?: string;
}> = [];

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => session,
    sendMagicLinkTo: async (
      recipient: string,
      _headers: Headers,
      callback: string
    ) => {
      invitations.push({ email: recipient, callback });
      if (invitationFails) throw new Error('Invitation provider unavailable');
    },
    emailMigrationConfirmationHtml: () => '<p>Email changed</p>',
    emailMigrationConfirmationText: () => 'Email changed',
  },
});
mock.module(import.meta.resolve('../lib/turnstile.ts'), {
  namedExports: { verifyTurnstile: async () => verificationPasses },
});
mock.module(import.meta.resolve('../lib/email.ts'), {
  namedExports: {
    sendTemplateEmail: async (
      template: string,
      variables: Record<string, unknown>,
      recipient?: string
    ) => {
      emails.push({ template, variables, recipient });
      if (notificationFails) throw new Error('Mail provider unavailable');
    },
    sendEmail: async () => {},
  },
});
mock.module(import.meta.resolve('../lib/server/referrals.ts'), {
  namedExports: {
    attachReferralToUser: async () => {},
    getActiveCookieAttribution: async () => null,
    resolveReferralAttribution: async () => null,
  },
});
mock.module(import.meta.resolve('next/headers'), {
  namedExports: {
    cookies: async () => ({
      get: () => (activeProfileId ? { value: activeProfileId } : undefined),
    }),
  },
});

const tables = [
  schema.users,
  schema.profiles,
  schema.profileOwners,
  schema.mentorSessions,
  schema.emailMigrations,
  schema.sessions,
];
let intake: typeof import('../app/api/listings/intake/route');
let decisions: typeof import('../app/api/admin/profile/action/route');
let contact: typeof import('../app/api/profile/saveContact/route');
let resend: typeof import('../app/api/profile/sendSubmission/route');
let mentoring: typeof import('../app/api/mentoring/profile/route');
let booking: typeof import('../app/api/mentoring/sessions/route');
let author: typeof import('../app/api/user/author/[id]/route');
let migration: typeof import('../app/api/user/complete-email-migration/route');
let pending: typeof import('../lib/server/pending-listing-owner');
let NextRequest: typeof import('next/server').NextRequest;
const originalHost = process.env.NEXT_PUBLIC_HOST_URL;

before(async () => {
  process.env.NEXT_PUBLIC_HOST_URL = 'https://directory.test.invalid';
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}` +
        (column.primary ? ' PRIMARY KEY' : '') +
        (column.isUnique ? ` CONSTRAINT "${column.uniqueName}" UNIQUE` : '')
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await pg.exec(`
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    CREATE UNIQUE INDEX profile_owners_profile_user_unique
      ON profile_owners (profile_id, user_id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (user_id) REFERENCES users (id);
    ALTER TABLE profile_owners ADD FOREIGN KEY (profile_id) REFERENCES profiles (id);
  `);
  await pg.exec(
    await readFile(
      new URL('../drizzle/0072_profile_contact_email.sql', import.meta.url),
      'utf8'
    )
  );
  intake = await import('../app/api/listings/intake/route');
  decisions = await import('../app/api/admin/profile/action/route');
  contact = await import('../app/api/profile/saveContact/route');
  resend = await import('../app/api/profile/sendSubmission/route');
  mentoring = await import('../app/api/mentoring/profile/route');
  booking = await import('../app/api/mentoring/sessions/route');
  author = await import('../app/api/user/author/[id]/route');
  migration = await import('../app/api/user/complete-email-migration/route');
  pending = await import('../lib/server/pending-listing-owner');
  ({ NextRequest } = await import('next/server'));
});

beforeEach(async () => {
  for (const table of [...tables].reverse()) await db.delete(table);
  await db.insert(schema.users).values({
    id: userId,
    email,
    name: 'Ana Person',
    accountType: 'personal',
  });
  await db.insert(schema.profiles).values({
    id: personalId,
    userId,
    email,
    name: 'Ana Person',
    active: true,
  });
  session = { user: { id: userId, email, name: 'Ana Person' } };
  activeProfileId = undefined;
  verificationPasses = true;
  invitationFails = false;
  notificationFails = false;
  invitations.length = 0;
  emails.length = 0;
});

after(async () => {
  if (originalHost === undefined) delete process.env.NEXT_PUBLIC_HOST_URL;
  else process.env.NEXT_PUBLIC_HOST_URL = originalHost;
  await pg.close();
});

function request(body: Record<string, unknown>) {
  return new NextRequest('https://directory.test.invalid/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function submit(overrides: Record<string, unknown> = {}) {
  return intake.POST(
    request({
      name: 'Ana Bakery',
      email,
      fiveWords: 'Fresh bread and pastries',
      instagram: 'anabakery',
      agreeTos: true,
      turnstileToken: 'verified-test-token',
      ...overrides,
    })
  );
}

async function saved(profileId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, profileId),
  });
  assert.ok(profile);
  return profile;
}

test('an existing pana can submit and manage a separate listing with the same email', async () => {
  const response = await submit({
    manageWithPana: true,
    expectedManagerId: userId,
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'account');
  assert.equal(result.invitationEmail, null);
  assert.equal(result.invitationSent, false);
  const listing = await saved(result.profileId);
  assert.equal(listing.email, email);
  assert.equal(listing.userId, null);
  assert.equal(listing.pendingOwnerEmail, null);
  assert.equal(listing.active, false);
  assert.equal((await saved(personalId)).name, 'Ana Person');
  assert.equal((await db.query.users.findFirst())?.accountType, 'personal');
  const owner = await db.query.profileOwners.findFirst();
  assert.equal(owner?.userId, userId);
  assert.equal(owner?.profileId, listing.id);
  assert.deepEqual(invitations, []);

  const notification = emails.find(
    (mail) => mail.template === 'admin.profile_submission'
  );
  assert.ok(notification);
  assert.equal(notification.variables.name, 'Ana Bakery');
  const approve = new URL(String(notification.variables.approve_url));
  assert.equal(approve.searchParams.get('profileId'), listing.id);
  assert.equal(approve.searchParams.has('email'), false);
});

test('a custom business contact still belongs to the signed-in pana, not a new login', async () => {
  const response = await submit({
    email: '  HELLO@BAKERY.TEST  ',
    manageWithPana: true,
  });
  assert.equal(response.status, 201);
  const listing = await saved((await response.json()).profileId);
  assert.equal(listing.email, 'hello@bakery.test');
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
  assert.equal((await db.query.users.findFirst())?.email, email);
  assert.equal((await saved(personalId)).email, email);
  assert.deepEqual(invitations, []);
});

test('a guest can submit without creating or inviting a personal account', async () => {
  session = null;
  const response = await submit({ email: 'hello@bakery.test' });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'unclaimed');
  assert.equal(result.invitationEmail, null);
  assert.equal((await saved(result.profileId)).userId, null);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal((await db.select().from(schema.users)).length, 1);
  assert.deepEqual(invitations, []);
  assert.equal(
    emails.find((mail) => mail.template === 'profile.submitted')?.recipient,
    'hello@bakery.test'
  );
});

test('a guest invites their chosen personal address and must explicitly accept ownership', async () => {
  session = null;
  const response = await submit({
    email: 'hello@bakery.test',
    personalEmail: '  OWNER@PERSONAL.TEST  ',
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'invitation');
  assert.equal(result.invitationEmail, 'owner@personal.test');
  assert.equal(result.invitationSent, true);
  assert.deepEqual(invitations, [
    {
      email: 'owner@personal.test',
      callback: '/account',
    },
  ]);
  assert.equal((await saved(result.profileId)).email, 'hello@bakery.test');
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.equal(
    (await pending.listPendingInvitations('owner@personal.test'))[0]?.profileId,
    result.profileId
  );

  await db.insert(schema.users).values({
    id: 'invited-owner',
    email: 'owner@personal.test',
  });
  assert.equal(
    await pending.acceptPendingInvitation(
      'invited-owner',
      'owner@personal.test',
      result.profileId
    ),
    'accepted'
  );
  assert.equal(
    (await db.query.profileOwners.findFirst())?.userId,
    'invited-owner'
  );
  assert.equal((await saved(result.profileId)).userId, null);
});

test('a guest with one inbox can request their account invitation at the contact address', async () => {
  session = null;
  const response = await submit({ personalEmail: email });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'invitation');
  assert.equal(result.invitationEmail, email);
  assert.equal(invitations[0]?.email, email);
  assert.equal((await saved(result.profileId)).pendingOwnerEmail, email);
});

test('a signed-in submitter can leave another listing unclaimed', async () => {
  const response = await submit({ manageWithPana: false });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.management, 'unclaimed');
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(invitations, []);
});

test('a signed-in submitter can invite somebody else instead of becoming the owner', async () => {
  const response = await submit({
    manageWithPana: false,
    personalEmail: 'actual-owner@personal.test',
  });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.management, 'invitation');
  assert.equal(invitations[0]?.email, 'actual-owner@personal.test');
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('an expired session cannot silently turn a managed application into an unclaimed one', async () => {
  session = null;
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 401);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(emails, []);
});

test('a stale manager selection cannot assign a listing to a different authenticated account', async () => {
  const response = await submit({
    manageWithPana: true,
    expectedManagerId: 'previous-account',
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'manager_changed');
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(emails, []);
});

test('an ownership write failure rolls back the listing instead of leaving a partial submission', async (context) => {
  context.mock.method(console, 'error', () => {});
  session = { user: { id: 'deleted-account', email, name: 'Deleted' } };
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 500);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
  assert.deepEqual(emails, []);
});

test('personal names do not count as duplicate listings, but repeat applications do', async () => {
  const response = await submit({ name: 'Ana Person', manageWithPana: true });
  assert.equal(response.status, 201);
  const repeat = await submit({
    name: 'ANA PERSON',
    email: email.toUpperCase(),
  });
  assert.equal(repeat.status, 409);
  assert.match((await repeat.json()).error, /name and contact email/);
  const different = await submit({ name: 'Ana Studio', manageWithPana: true });
  assert.equal(different.status, 201);
  assert.equal((await db.select().from(schema.profiles)).length, 3);
});

test('concurrent duplicate submissions save only one listing and owner', async (context) => {
  context.mock.method(console, 'error', () => {});
  const responses = await Promise.all([
    submit({ manageWithPana: true }),
    submit({ manageWithPana: true }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort((a, b) => a - b),
    [201, 409]
  );
  assert.equal((await db.select().from(schema.profiles)).length, 2);
  assert.equal((await db.select().from(schema.profileOwners)).length, 1);
});

test('Turnstile remains required before an application or ownership is written', async () => {
  verificationPasses = false;
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 400);
  assert.equal((await db.select().from(schema.profiles)).length, 1);
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('an invitation mail failure preserves the application and reports that no link was sent', async (context) => {
  context.mock.method(console, 'error', () => {});
  invitationFails = true;
  session = null;
  const response = await submit({ personalEmail: 'owner@personal.test' });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.management, 'invitation');
  assert.equal(result.invitationSent, false);
  assert.equal(
    (await saved(result.profileId)).pendingOwnerEmail,
    'owner@personal.test'
  );
  assert.equal(
    (await pending.listPendingInvitations('owner@personal.test')).length,
    1
  );
});

test('a notification outage does not lose an application or its chosen owner', async (context) => {
  context.mock.method(console, 'error', () => {});
  notificationFails = true;
  const response = await submit({ manageWithPana: true });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal((await saved(result.profileId)).active, false);
  assert.equal(
    (await db.query.profileOwners.findFirst())?.profileId,
    result.profileId
  );
});

test('legacy approval links select the access-key holder, not the first matching email', async () => {
  const first = await (await submit({ name: 'First Listing' })).json();
  const second = await (await submit({ name: 'Second Listing' })).json();
  const secondListing = await saved(second.profileId);
  const status = secondListing.status as { access: string };
  const response = await decisions.POST(
    request({
      email,
      access: status.access,
      action: 'approve',
    })
  );
  assert.equal((await response.json()).success, true);
  assert.equal((await saved(first.profileId)).active, false);
  assert.equal((await saved(second.profileId)).active, true);
  assert.equal((await saved(personalId)).status, null);
});

test('new approval links survive changes to the listing contact address', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  const listing = await saved(result.profileId);
  const status = listing.status as { access: string };
  activeProfileId = listing.id;
  assert.equal(
    (await contact.POST(request({ email: 'new-contact@bakery.test' }))).status,
    200
  );
  const response = await decisions.POST(
    request({
      profileId: listing.id,
      access: status.access,
      action: 'approve',
    })
  );
  assert.equal((await response.json()).success, true);
  assert.equal((await saved(listing.id)).active, true);
  assert.equal((await saved(personalId)).status, null);
});

test('neither a shared inbox nor a profile id substitutes for the review capability', async () => {
  const result = await (await submit()).json();
  const response = await decisions.POST(
    request({
      profileId: result.profileId,
      email,
      access: 'not-the-review-key',
      action: 'approve',
    })
  );
  assert.equal((await response.json()).success, false);
  assert.equal((await saved(result.profileId)).active, false);
});

test('staff can resend an unclaimed submission without becoming its owner', async () => {
  const listing = await (await submit()).json();
  session = { user: { id: userId, email, name: 'Ana Admin', isAdmin: true } };
  emails.length = 0;
  const response = await resend.POST(request({ profileId: listing.profileId }));
  assert.equal(response.status, 200);
  const notification = emails.find(
    (mail) => mail.template === 'admin.profile_submission'
  );
  assert.ok(notification);
  assert.equal(
    new URL(String(notification.variables.approve_url)).searchParams.get(
      'profileId'
    ),
    listing.profileId
  );
  assert.deepEqual(await db.select().from(schema.profileOwners), []);
});

test('submission resends use the owned profile id and reject email-based ownership guesses', async () => {
  const owned = await (await submit({ manageWithPana: true })).json();
  const unclaimed = await (await submit({ name: 'Somebody Else' })).json();
  emails.length = 0;
  const response = await resend.POST(request({ profileId: owned.profileId }));
  assert.equal(response.status, 200);
  assert.equal(
    emails.find((mail) => mail.template === 'admin.profile_submission')
      ?.variables.name,
    'Ana Bakery'
  );
  assert.equal(
    (await resend.POST(request({ profileId: unclaimed.profileId }))).status,
    403
  );
  session = null;
  assert.equal(
    (await resend.POST(request({ profileId: owned.profileId }))).status,
    401
  );
});

test('editing a listing contact email leaves the personal profile and login unchanged', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  activeProfileId = result.profileId;
  const response = await contact.POST(
    request({ email: '  HELLO@BAKERY.TEST  ' })
  );
  assert.equal(response.status, 200);
  assert.equal((await saved(result.profileId)).email, 'hello@bakery.test');
  assert.equal((await saved(personalId)).email, email);
  assert.equal((await db.query.users.findFirst())?.email, email);
  assert.equal(
    (await contact.POST(request({ email }))).status,
    200,
    'the Pana inbox may be copied back onto the listing'
  );
});

test('listing contact validation and active-profile authorization remain enforced', async () => {
  const owned = await (await submit({ manageWithPana: true })).json();
  activeProfileId = owned.profileId;
  assert.equal(
    (await contact.POST(request({ email: 'not-an-email' }))).status,
    400
  );
  assert.equal((await saved(owned.profileId)).email, email);

  const unclaimed = await (await submit({ name: 'Not Mine' })).json();
  activeProfileId = unclaimed.profileId;
  assert.equal(
    (await contact.POST(request({ email: 'stolen@bakery.test' }))).status,
    400
  );
  assert.equal((await saved(unclaimed.profileId)).email, email);
  assert.equal((await saved(personalId)).email, email);
});

test('a later Pana email change does not change the copied listing contact email', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  await db.insert(schema.emailMigrations).values({
    userId,
    oldEmail: email,
    newEmail: 'new-pana@personal.test',
    migrationToken: 'account-email-change',
    expiresAt: new Date(Date.now() + 60_000),
  });
  const response = await migration.POST(
    request({ token: 'account-email-change' })
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await db.query.users.findFirst())?.email,
    'new-pana@personal.test'
  );
  assert.equal((await saved(personalId)).email, 'new-pana@personal.test');
  assert.equal((await saved(result.profileId)).email, email);
  assert.equal((await db.query.profileOwners.findFirst())?.userId, userId);
});

test('mentoring edits update only the human identity, not listings sharing the inbox', async () => {
  const result = await (await submit({ manageWithPana: true })).json();
  const response = await mentoring.PATCH(
    request({
      enabled: true,
      expertise: ['art'],
      languages: ['en'],
      bio: 'A sufficiently detailed mentoring biography.',
    })
  );
  assert.equal(response.status, 200);
  assert.equal((await saved(result.profileId)).mentoring, null);
  assert.equal(
    ((await saved(personalId)).mentoring as { enabled: boolean }).enabled,
    true
  );
});

test('booking resolves the mentor account, not a listing with the same contact', async () => {
  await db
    .insert(schema.users)
    .values({ id: 'mentor-account', email: 'mentor@personal.test' });
  await db.insert(schema.profiles).values({
    email: 'mentor@personal.test',
    name: 'Mentor Business',
    status: { source: 'business_intake' },
  });
  await db.insert(schema.profiles).values({
    userId: 'mentor-account',
    email: 'mentor@personal.test',
    name: 'Mentor Person',
    mentoring: { enabled: true },
  });
  const response = await booking.POST(
    request({
      mentorEmail: 'mentor@personal.test',
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      duration: 30,
      topic: 'Creative business support',
      sessionType: 'pana_support',
    })
  );
  assert.equal(response.status, 201);
  assert.equal(
    (await db.query.mentorSessions.findFirst())?.mentorEmail,
    'mentor@personal.test'
  );
});

test('author verification comes from the personal identity, never another profile sharing its email', async () => {
  const result = await (await submit()).json();
  await db
    .update(schema.profiles)
    .set({ active: true, verification: { panaVerified: true } })
    .where(eq(schema.profiles.id, result.profileId));
  const response = await author.GET(request({}), {
    params: Promise.resolve({ id: userId }),
  });
  assert.equal((await response.json()).verified, false);
});
