# Sign-In System Documentation

## Seamless Provider Switching

### Can users freely change between sign-in methods?

**YES - Seamless provider switching, with one caveat**

Users with the same email address registered with multiple OAuth providers can freely switch between sign-in methods for a seamless UX.

### How it works

**Scenario: Alice has `alice@example.com` and uses multiple providers**

#### 1. First sign-in with Google (trusted provider)

- better-auth creates user record with `alice@example.com`
- Creates account link: `{userId: "abc123", provider: "google", providerAccountId: "google-id-456"}`
- Profile auto-claimed immediately

#### 2. Later sign-in with Wikimedia (verification-required provider)

- Alice authenticates with Wikimedia OAuth → provides `alice@example.com`
- Sign-in blocked, verification email sent
- Alice clicks magic link
- `/api/oauth/complete-verification` executes:

```typescript
const existingUser = await tx.user.findUnique({ where: { email } }); // Finds Alice's user
userId = existingUser.id; // Same userId!

// Check if account link already exists
const existingAccount = await tx.account.findUnique({
  where: {
    provider_providerAccountId: {
      provider: 'wikimedia',
      providerAccountId: 'wikimedia-id-789',
    },
  },
});

if (!existingAccount) {
  // Create NEW account link for Wikimedia
  await tx.account.create({
    data: {
      userId, // Same userId as Google!
      type: 'oauth',
      provider: 'wikimedia',
      providerAccountId: 'wikimedia-id-789',
    },
  });
}
```

#### 3. Result: Alice now has TWO account links, ONE user

**User record (PostgreSQL `users` table):**

```json
{
  "id": "abc123",
  "email": "alice@example.com",
  "emailVerified": "2025-01-01T00:00:00Z"
}
```

**Account links (PostgreSQL `accounts` table):**

- Account 1: `{userId: "abc123", provider: "google", providerAccountId: "google-id-456"}`
- Account 2: `{userId: "abc123", provider: "wikimedia", providerAccountId: "wikimedia-id-789"}`

#### 4. Subsequent sign-ins

- Alice can use **either** Google or Wikimedia
- Both authenticate to the **same user record**
- Same sessions, same profile, seamless switching

## The One Caveat

**First-time verification-required providers need one-time email verification**

- If Alice's **first** sign-in is Wikimedia → requires verification
- If Alice's **first** sign-in is Google → immediate access
- After both are linked → completely seamless

## Inside the Android and iOS apps

**Android offers native Google sign-in and email links. iOS remains email-only.**

Google web OAuth cannot run in an embedded WebView (`disallowed_useragent`).
Android instead uses `@capgo/capacitor-social-login`, backed by Google's
Credential Manager. The public Web client ID is resolved from the server's
`GOOGLE_CLIENT_ID`, not a separate build-time variable. The native SDK returns
an ID token with a fresh nonce; the WebView sends both to Better Auth's existing
`signIn.social` endpoint. Better Auth verifies the signature, issuer, audience,
expiry, and nonce and sets the app's own HttpOnly session cookie.

The button requires `NEXT_PUBLIC_GOOGLE_ENABLED=true`, a configured
`GOOGLE_CLIENT_ID`, and an Android build containing the native plugin. Older
builds keep email sign-in rather than attempting unsupported web OAuth.
Register Android OAuth clients for `social.pana.app` and **each installed signing
key's SHA-1**, in the same Google Cloud project as the Web client.
See [Android setup](./ANDROID.md#native-google-sign-in).

**App-requested email links must not verify in the browser first.** The app
passes `metadata.nativeApp=true` when requesting a link. The email then points
to `/signin/mobile`, preserving the original one-time token and callbacks
without consuming them. Verified App Links / Universal Links open that page
directly in the app. If a mail client opens a browser instead, the page offers
an explicit **Open Pana Mia app** action using the registered
`social.pana.app://auth/magic-link` scheme; Android targets our package with an
`intent://` URL. Only the app then visits `/api/auth/magic-link/verify`, so the
session belongs to its WebView. **Continue in browser instead** is an explicit
alternative, not an automatic fallback that steals the app's token.

The handoff page is private/no-store and uses `Referrer-Policy: no-referrer`.
Native links reject foreign origins and arbitrary scheme destinations.
`NativeShell` handles warm links and `App.getLaunchUrl()` on cold launches;
only a fingerprint is saved to prevent replaying a launch after navigation.
Web-requested email links retain their existing browser verification URL.
Existing links already consumed by a browser cannot be reused: request a fresh
link from the updated app.

Accounts are unchanged: Google and email sign-in to the same verified address
use the same account. iOS does not expose Google or other third-party providers;
adding native Google there must include the corresponding Sign in with Apple
and App Store guideline 4.8 work.

## Data Structure

### PostgreSQL `users` table

```json
{
  "id": "abc123",
  "email": "alice@example.com",
  "emailVerified": "2025-01-01T00:00:00Z"
}
```

### PostgreSQL `accounts` table

```json
[
  {
    "userId": "abc123",
    "type": "oauth",
    "provider": "google",
    "providerAccountId": "google-id-456"
  },
  {
    "userId": "abc123",
    "type": "oauth",
    "provider": "wikimedia",
    "providerAccountId": "wikimedia-id-789"
  },
  {
    "userId": "abc123",
    "type": "email",
    "provider": "email",
    "providerAccountId": "alice@example.com"
  }
]
```

## Security Note

This is a **feature** of better-auth called "account linking" and it's secure because:

- Each provider independently verified the email address
- The linking happens at the `userId` level (identified by email)
- User has one identity, multiple authentication methods
- No UX friction after initial verification

## Implementation Details

### Email sign-in delivery

Signup and email sign-in both use `sendEmail()` in `lib/email.ts`, backed by
the Worker's native `EMAIL` binding. Production sends from
`Pana MIA <hola@panamia.club>`; `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME`,
and `EMAIL_ENV=PROD` are runtime variables pinned in `wrangler.jsonc`.

New sign-in links are single-use and expire after **30 minutes**. The plugin's
`expiresIn` and the HTML/plain-text expiry copy share
`MAGIC_LINK_EXPIRY_MINUTES` in `auth.ts`; do not rely on Better Auth's
five-minute default. Changing this setting does not extend links that were
already issued.

Verification failures default to `/signin`, where an invalid or expired link
shows a recovery message and opens the email form. The original success
destination is preserved as `callbackUrl` for the replacement link. This
default is applied in the auth request handler, so older emails without an
`errorCallbackURL` also recover instead of sending users to a silent homepage
error. Explicit error callbacks and Better Auth's origin validation remain
in effect.

The binding alone does not enable delivery. In the **same Cloudflare account
that hosts `panamia-next`**:

1. Enable **Workers Paid**. Sending to arbitrary signup addresses is not
   available on Workers Free. The current plan starts at $5/month and includes
   3,000 outbound emails/month, then $0.35 per 1,000 emails. See
   [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/).
2. Onboard **`panamia.club`** under **Email Service > Email Sending**, not
   Email Routing. Alternatively, run
   `wrangler email sending enable panamia.club` with access to that account.
3. Confirm sending DNS is configured using
   `wrangler email sending dns get panamia.club`. Sending uses `cf-bounce`
   records and its own DKIM selector; keep the existing Google Workspace MX
   records at the root domain.
4. Deploy the sender configuration, request a real sign-in link, and confirm
   it arrives. A working sign-in page or anonymous session endpoint does not
   prove email delivery.

Cloudflare's `could not find account config of sending domain` error means
the configured sender cannot be used by the deployment's account. Check the
paid-plan prerequisite and sender-domain onboarding before changing auth
routes. Moving a Worker to another account does not carry over those settings.
Provider failures propagate to the sign-in request, and a missing `EMAIL`
binding is an error rather than a successful no-op. Local development keeps
logging instead of sending unless `EMAIL_ENV=PROD`.

Delivery and inbox placement are separate. If Gmail puts a delivered message
in spam, check **Show original** for the SPF, DKIM, and DMARC results. Share
only that summary when troubleshooting: the full message contains a sign-in
token. Passing authentication does not guarantee inbox placement; sender/IP
reputation, message content, and recipient filtering can still affect it. See
[Google's sender guidelines](https://support.google.com/mail/answer/81126).
Recipients can use **Report not spam** to help their own mailbox recognize
the sender, but this does not guarantee delivery to other users' inboxes.
The sign-in confirmation reminds users to check their spam or junk folder.
Do not weaken DMARC or replace the Google Workspace MX records to address a
spam classification when authentication already passes.

The email sender is independent of `FEDERATION_DOMAIN=pana.social`. Do not
rewrite ActivityPub identities when changing the sending address.

### Turning on Google sign-in

Google sign-in is implemented end to end — provider config in `auth.ts`, the
`signIn.social()` path in `lib/auth-client.ts`, and the button in
`app/signin/_components/signin-view.tsx`. Nothing is left to build; it ships
switched off because it needs credentials. To enable it:

1. **Pick the right Google account first — this is hard to undo.** The OAuth
   client belongs to a Google Cloud project owned by one Google account, and the
   binding that matters is Search Console: `pana.social` has to be listed as an
   **Authorized domain** before Google will accept the redirect URI, and
   authorized domains are verified from the owning account. Lose the account and
   nobody can edit the consent screen or the redirect URIs, so there is no way
   to repair sign-in. Verification itself is a DNS TXT record in Cloudflare.

   **Use the `panamia.club` Workspace account (`jose@panamia.club`).** A
   Workspace identity is organisation-owned, so a super-admin can recover or
   transfer it, and projects created by a Workspace user are placed under the
   `panamia.club` Cloud **Organization** rather than owned by an individual.
   That is the continuity property a personal Gmail cannot offer. Add a second
   **Owner** to the project anyway.

   **The catch is that the Workspace domain is not the product domain.**
   `panamia.club` is the older, separate deployment described in
   [DOMAINS.md](./DOMAINS.md), whose future is an open product decision. If it
   is ever retired _and_ the Workspace subscription is cancelled with it, the
   account owning this OAuth client disappears and Google sign-in on
   `pana.social` breaks. Retiring the website while keeping the domain and
   Workspace is fine; cancelling both is not. Decide that before building on it.

   `pana.social` itself has no Workspace — mail is Cloudflare — so
   `hola@pana.social` is not a Google identity and cannot own the project or be
   selected as the support email. Do not add `pana.social` as a Workspace
   secondary domain just to obtain a matching address: that repoints MX at
   Google and disturbs the Cloudflare email setup for no OAuth benefit.

2. **Create an OAuth client** in the
   [Google Cloud console](https://console.cloud.google.com/apis/credentials) →
   _Create credentials_ → _OAuth client ID_ → _Web application_.

   Consent screen settings that catch people out:
   - **Every URL on the consent screen must be `panamia.club`.** Publishing asks
     for homepage, privacy policy and terms links, and the instinct is to use
     the identity domain. Do not: `pana.social` is retained for ActivityPub
     identities, but it does not currently serve the website. See
     [DOMAINS.md](./DOMAINS.md).
   - **User type must be External.** _Internal_ would admit only
     `@panamia.club` Workspace members, whereas members sign in with their own
     Google accounts.
   - **Press "Publish app".** External starts in _Testing_, which caps sign-in
     at 100 individually allowlisted addresses. Publishing to Production needs
     no Google verification review, because the scopes below are all
     non-sensitive. Keep it that way.
   - **User support email is a dropdown**, offering only the owning account or a
     Google Group it belongs to, and it is shown publicly on the consent screen.
     `jose@panamia.club` works; a Workspace group such as `hola@panamia.club` is
     nicer. `hola@pana.social` will not be listed. The separate _Developer
     contact information_ field is free text and not shown to users, so
     `hola@panamia.club` belongs there.

3. **Register the redirect URI.** better-auth serves every provider from one
   mount, so the authorised redirect URI is:

   ```text
   https://panamia.club/api/auth/callback/google
   ```

   Add one entry per origin you sign in from, including
   `http://localhost:3000/api/auth/callback/google` for local work. An origin
   must also be in `trustedOrigins` (`auth.ts`), which already covers the
   panaverse surfaces and localhost.

4. **Set the variables.** The first two are the credentials, the third reveals
   the button:

   | Variable                     | Where  | Value            |
   | ---------------------------- | ------ | ---------------- |
   | `GOOGLE_CLIENT_ID`           | VAR    | from the console |
   | `GOOGLE_CLIENT_SECRET`       | SECRET | from the console |
   | `NEXT_PUBLIC_GOOGLE_ENABLED` | VAR    | `true`           |

   All three are **runtime** values. `NEXT_PUBLIC_GOOGLE_ENABLED` is already
   set to `"true"` in `wrangler.jsonc`, so production needs nothing further —
   and keeping it there is deliberate, because plaintext variables set in the
   Cloudflare dashboard are wiped on every Workers Builds deploy.

   `OAUTH_GOOGLE` may be left unset: it defaults to `trusted` from
   `lib/env.config.ts`.

   > **Do not move this flag to Build variables.** The `NEXT_PUBLIC_` prefix
   > suggests it is inlined at build time, and for a value read inside a client
   > component it would be. This one is not: `app/signin/page.tsx` reads it on
   > the server and passes the result to `signin-view.tsx` as a prop.
   >
   > It used to be read directly in that client component, and the failure mode
   > is worth knowing because it is silent. With no build variable set, the
   > bundler collapses `process.env` and the check compiles to
   > `{}.NEXT_PUBLIC_GOOGLE_ENABLED === 'true'` — false forever, whatever the
   > runtime env says. The server, reading the real runtime value, renders the
   > button anyway; hydration then deletes it. `curl` shows a working page and
   > the browser shows none. The same trap is armed for the Apple, Wikimedia
   > and Mastodon flags, which is why all four are resolved server-side.

The consent screen asks for `openid`, `email` and `profile` only, which are
Google's non-sensitive scopes, so this does not require an app-verification
review.

### Account Linking for Trusted Providers

Trusted providers (Google, Apple, Email, mastodon.social) create account links automatically through better-auth's default flow.

A member who already signed in by magic link and then uses Google on the same
address is linked into the existing account rather than given a second one.
That holds because the magic link plugin marks those users
`emailVerified: true` and Google reports a verified email — better-auth
requires both. See "Account Linking" in `SECURITY_AUDIT.md` for the exact
conditions and the two cases that do _not_ link.

### Account Linking for Verification-Required Providers

Verification-required providers (Wikimedia, self-hosted Mastodon) create account links after email verification:

1. OAuth authentication succeeds
2. Sign-in blocked, verification email sent
3. User clicks magic link
4. `/api/oauth/complete-verification` checks for existing user by email
5. If user exists: creates new account link to existing user
6. If user doesn't exist: creates new user + account link
7. Profile auto-claimed (if unclaimed)
8. User can now sign in with this provider

**Code reference:** `/app/api/oauth/complete-verification/route.ts:51-101`

---

## Developer Scripts

### Create a sign-in link

```bash
npx tsx scripts/create-signin-link.ts <email>
```

Creates a magic link that can be used to sign in as any user. Useful for testing.

### Check sign-in token status

```bash
npx tsx scripts/get-signin-link.ts <email>
```

Shows if there are pending verification tokens for an email. Note: tokens are stored hashed, so URLs cannot be reconstructed. Use `create-signin-link.ts` to create new links.

### Delete a user

```bash
npx tsx scripts/delete-user.ts <email>
```

Completely removes a user and their profile from PostgreSQL.

---

## TODO: Account Settings Enhancements

### Active Sessions Display

Add to `/account/user/edit` or a new `/account/security` page:

- Show all actively signed-in sessions
- Display for each session:
  - Last login location (city/country from IP geolocation)
  - IP address
  - Web browser / User agent
  - Last activity timestamp
- Allow users to revoke other sessions ("Sign out everywhere else")
