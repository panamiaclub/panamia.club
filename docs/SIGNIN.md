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

**The native apps offer magic link only. No third-party sign-in is shown.**

This is not a gap in the apps, it is the platforms refusing. Google returns
`disallowed_useragent` for OAuth started in an embedded WebView, by policy and
with no setting that changes it, and the remaining providers would each need
their own native SDK before they could be offered honestly. Rendering the
buttons anyway would ship controls that fail, and a member who taps one cannot
tell a broken app from a broken account.

So `app/signin/_components/signin-view.tsx` filters the whole provider list out
when `useIsNativeApp()` is true. With no providers left, `hasOAuth` is false and
the existing behaviour takes over: the magic-link form opens by default, with no
toggle to get past first. Magic link behaves identically in the app and the
browser.

Nothing about accounts changes. A member who signed up with Google on the web
signs in to the app with a magic link to the same address and lands in the same
account — the linking described above is what makes that work.

Two consequences worth knowing:

- **App Store guideline 4.8 stays out of scope.** The requirement to offer Sign
  in with Apple is triggered by offering _other_ third-party sign-in options.
  This app offers none, so it does not apply.
- **The OAuth hosts remain in `allowNavigation`** in `capacitor.config.ts`. They
  are not reachable from the app's own UI, but leaving them listed means a
  sign-in reached some other way still completes in the WebView, where its
  cookie is readable, rather than in a browser where it is not.

See `docs/MOBILE-ROADMAP.md` for what changing this would cost.

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
     identities and email, but it does not currently serve the website. See
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
     `hola@pana.social` belongs there.

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
