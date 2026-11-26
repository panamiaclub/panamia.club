# Native push notifications

The Capacitor shells use Apple APNs on iOS and Firebase Cloud Messaging HTTP v1
on Android. No Firebase iOS SDK or third-party notification service is used.
The website's desktop alerts are unchanged.

## Server deployment

Apply `0080_native_push.sql` through `yarn db:migrate` before deploying the Worker.
The migration journal follows `0078_social_interaction_notifications.sql`.
Notification inserts atomically enqueue delivery to currently registered devices,
including bulk group notifications and post likes/replies. There is no historical
backfill and no hook into live DM sockets: messages held in Requests still do not
create a bell notification and therefore do not enqueue push.

Add these **server-only Cloudflare secrets**, never `NEXT_PUBLIC_*` variables:

- `PUSH_APNS_CONFIG`: JSON with `teamId`, `keyId`, `privateKey` (the complete
  PKCS8 `.p8` text, with JSON-escaped newlines), and `environment` (`production`
  for App Store/TestFlight; `sandbox` for development provisioning).
- `PUSH_FCM_SERVICE_ACCOUNT`: Google service-account JSON containing `project_id`,
  `client_email`, and `private_key`. Enable the Firebase Cloud Messaging API in
  that project and grant the service account Firebase Cloud Messaging API Admin
  (`roles/firebasecloudmessaging.admin`), not project Owner.

Use `yarn exec wrangler secret put PUSH_APNS_CONFIG` and
`yarn exec wrangler secret put PUSH_FCM_SERVICE_ACCOUNT` with securely prepared
JSON. Do not paste credentials into source, issue comments, or build logs.
An unconfigured platform returns a visible registration error rather than
pretending it can deliver. Malformed configuration also fails registration
explicitly. Signing keys must be PEM **strings**, never serialized Buffer
objects; read `.p8` files as UTF-8 text before JSON-encoding `privateKey`.
Credentials/configuration must match the installed
app and its APNs environment; use a separate preview Worker for sandbox testing.

Deploy `wrangler.jsonc` with its additional **every-minute** Cron Trigger.
Each tick leases up to 25 deliveries, with exponential retries, at most eight
attempts, and a one-day queue lifetime. The existing hourly maintenance job
still runs only on its own schedule. Normal push latency is roughly one minute
plus provider delivery time, not an instant socket acknowledgement. Watch
`[push]` errors and failed scheduled invocations; exhausted jobs remain visible
in `push_deliveries` (`attempts >= 8`) until the one-day cleanup. An operator can
reset attempts/available_at after fixing credentials if the job is still fresh.
Higher traffic requires increasing throughput or moving this outbox to a
dedicated queue consumer; do not assume 25 deliveries/minute is unbounded.

Delivery skips notifications already read/expired, revoked/expired sessions,
changed account ownership, and blocks established after enqueue. Unregistered
provider tokens are removed. Registrations expire after 30 days without a
foreground renewal; deleting the account/session cascades devices and jobs.
Retries are at-least-once: an ambiguous provider timeout can duplicate a push;
APNs collapse IDs and FCM tags limit duplicate presentation.

## Android

1. In Firebase, register Android package **`social.pana.app`**. Download its
   `google-services.json` to `mobile/android/app/google-services.json`
   (gitignored). It is Firebase application configuration, **not** the server
   service-account key.
2. Set Actions secret `ANDROID_GOOGLE_SERVICES_JSON` to that file's complete JSON
   for **Android Release**. The release workflow requires it. Verification debug
   builds without this file still compile but cannot register for FCM.
3. Run `yarn mobile:sync` and rebuild/install (`yarn mobile`). Android 13+
   requests `POST_NOTIFICATIONS` after the user taps Enable. Firebase Messaging
   auto-init and analytics collection are disabled in the manifest; registration
   enables messaging only after that opt-in. Disable/logout unregisters the SDK.
   Older Android
   releases may report permission granted even if notifications/channel alerts
   were disabled in system settings; check Settings when testing.
4. Use a device/emulator with Google Play services. The shared app creates
   `pana-notifications` before registration. The FCM payload contains both an
   OS-displayed notification and the opaque notification ID for cold/warm taps.

Native Google sign-in still uses Credential Manager; Firebase is required here
only for Android push.

## iOS

1. Enable **Push Notifications** for App ID **`social.pana.app`** in the Apple
   Developer organization, then regenerate development/distribution provisioning
   profiles. Personal Team sideload builds using `Personal.entitlements` do not
   support push; use organization provisioning for push testing.
2. Create an APNs token-signing key and place its key/team identifiers and `.p8`
   text in `PUSH_APNS_CONFIG`. Keep the `.p8` only in the credential vault.
3. Run `yarn mobile:sync` on macOS and rebuild using Xcode. The AppDelegate
   forwards APNs registration callbacks to Capacitor; the SPM target includes
   the plugin. Debug requests the development entitlement and Release requests
   production. The provisioning profile and server environment must agree.
4. No silent/background execution entitlement is required: these are visible
   alerts delivered by the OS, not background fetches.

## User controls, privacy, and taps

Signed-in members can choose **Enable push notifications** from their native
Profile/account screen. Permission is requested on that action, never at launch.
The same control disables this device's registration. Foreground resume renews
tokens/permission state without requesting permission again. Signing in to a
different account rebinds the installation and removes the previous account's
pending jobs. Push stays account-scoped, not scoped to the currently selected
business identity.

Lock screens/providers receive only “Pana Mia”, “You have a new notification.”,
and an opaque notification ID. A tap resolves the saved notification through
an authenticated, no-store endpoint, verifies ownership/blocks/expiry, marks it
read, and navigates to its same-origin destination (for example `/status/<id>`).
A tap while signed out waits until sign-in; a tap from another account opens
the current account's updates, never the other account's destination. Destination
screens retain their normal authorization checks. Already accepted OS alerts
cannot be recalled reliably after remote logout/block, so their text stays
generic. Local logout clears visible delivered alerts.

Review the privacy policy and App Store privacy / Play Data safety disclosures
for Apple/Google delivery of tokens and metadata before shipping.

## Verification checklist

Automated coverage uses PGlite with the real migration/trigger and mocked
providers; provider contract tests verify JWT signatures and APNs/FCM payloads.
Run:

```powershell
node --import tsx --test tests-unit\native-push.test.ts
node --experimental-test-module-mocks --import tsx --test tests-db\native-push.test.ts tests-db\social-interaction-notifications.test.ts
```

With real credentials, verify on **both devices**: grant/deny, disable/re-enable,
foreground/background/terminated delivery, cold/warm taps, like/reply/follow/DM,
bulk group events, Requests silence, blocks, read-before-delivery suppression,
two accounts on one installation, local/remote logout, expired session, token
rotation, and account deletion. Verify iOS sandbox and TestFlight separately.
Inspect provider errors and scheduled-job logs without recording tokens/content.
Compilation and mocked tests do not establish real-device/provider delivery.
