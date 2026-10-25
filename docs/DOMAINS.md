# Domains

This document describes which domains serve Pana Mia, which domain federation identity is minted under, and why the string `pana.social` must never be changed with a find-and-replace.

Read this before repointing any domain constant. Two separate sessions independently concluded that the hardcoded `pana.social` on the legal pages was a stale federation value that should be "corrected" to `panamia.club`. Both were wrong, and the change would have taken the compliance-critical pages down.

## Live topology

Measured 2026-10-19 unless noted. Verify before acting on it; deployments move.

| Host                     | Status               | What it serves                                                                                                 |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pana.social`            | **No web address**   | Reserved for federated identities; it currently has no A or AAAA record.                                       |
| `social.pana.social`     | **Does not resolve** | No current web deployment.                                                                                     |
| `connectors.pana.social` | **200**              | Pana Connectors. Bound as a Worker Custom Domain 2026-10-07.                                                   |
| `admin.pana.social`      | **200** at `/admin`  | The admin console. Bound as a Worker Custom Domain 2026-10-07.                                                 |
| `events.pana.social`     | **Not planned**      | Nothing. Pana Events is served from `pana.social/e` instead — see [Events is path-only](#events-is-path-only). |
| `relay.pana.social`      | Resolves             | The **separate** `panamia-nosflare` Worker, not this one.                                                      |
| `www.panamia.club`       | **200**              | Alias serving this app. Auth must trust both this origin and the apex.                                         |
| `panamia.club` (apex)    | **200** (Cloudflare) | **This app.** The live production deployment.                                                                  |
| `social.panamia.club`    | **522**              | DNS exists, but the origin is not healthy; `PANAVERSE_SUBDOMAINS` remains off.                                 |
| `info.panamia.club`      | **200 (Cloudflare)** | App-maintained info page. Bound to `panamia-next` as a Worker Custom Domain on 2026-10-25.                     |

Every app surface that is getting a subdomain has one; `events.pana.social` is deliberately not among them. The bound ones still answer on the apex as well, at `pana.social/connectors` and `pana.social/admin` — binding a subdomain adds a front door, it does not move a route. Events only ever uses that apex door, at `pana.social/e`.

`www.panamia.club` now serves this codebase as an alias of the apex. It
previously served a separate Pages Router app, so older investigations may
describe a different topology. Authentication treats origins exactly rather
than by cookie domain: both `https://panamia.club` and
`https://www.panamia.club` must be present in Better Auth's `trustedOrigins`.
Otherwise every sign-in request from the alias is rejected before Google or
email delivery begins.

Measured 2026-10-22: `/signin` on both hosts returns the Vinext app and the same
Google/email controls.

### Replacing the GoHighLevel info site

Completed 2026-10-25: **`https://info.panamia.club/`** now serves this app
through the `panamia-next` Worker. The legacy proxied CNAME pointing to
`sites.ludicrous.cloud` was replaced with a Worker Custom Domain. Only the
`info` DNS record changed; the apex, `www`, relay, and mail records were
preserved.

The same page remains available at **`https://panamia.club/info`** and at
`info.localhost:<port>` in development. The apex homepage is unchanged.
The info page carries its own compact header/footer, English and Spanish
copy, current app destinations, and an inline newsletter form using the
existing `/api/createSignup` endpoint and Turnstile. Its canonical URL and
sitemap entry now use `https://info.panamia.club/`.

The new form stores signups in the app's `newsletter_signups` table and
sends the existing admin notification. GoHighLevel contacts, the old site,
and existing workflows were left intact; they were **not** imported, and
new subscribers are **not** enrolled in a GoHighLevel campaign.

**Deployment alone does not create the hostname binding.** The completed
rollout followed this order:

1. Deployed the app, verified `/info` and its destinations, and completed a
   real newsletter signup after the user completed Turnstile.
2. Preserved the existing GoHighLevel data and workflows without changing
   that account.
3. Confirmed the existing Turnstile widget allows `panamia.club`, which also
   authorizes `info.panamia.club` and its other subdomains. No widget change
   was needed.
4. Backed up the legacy proxied CNAME, then removed only that `info` record
   through Cloudflare DNS and bound the hostname to `panamia-next`.
   The Workers API refused to replace the externally managed CNAME, even
   with its DNS-override option; dashboard DNS access was required first.
5. Verified HTTPS, the new page, its legal links and newsletter verification
   guard, and the unchanged apex homepage after edge propagation. The old
   `/newsletter-sign-up-702983` URL returns a permanent 308 redirect to
   `/info#newsletter-signup`.
6. Removed only the info surface's `subdomainPending: true` flag and deployed
   its final canonical URL. The global `PANAVERSE_SUBDOMAINS` flag remains
   off, and `FEDERATION_DOMAIN` remains `pana.social`.

**Rollback:** Restore the info surface's pending flag and deploy before
changing DNS, so its canonical returns to `https://panamia.club/info`.
Then remove only the info Worker Custom Domain and restore the proxied
`info` CNAME pointing to `sites.ludicrous.cloud` with Auto TTL. Verify the
restored GoHighLevel page and HTTPS; do not change the apex, mail records,
federation domain, or other surface bindings.

### Transactional email uses `panamia.club`

As of 2026-10-25, the app's outgoing sender is `hola@panamia.club`, configured
by `EMAIL_SENDER_ADDRESS` in `wrangler.jsonc`. Email Sending requires Workers
Paid and onboarding `panamia.club` in the same Cloudflare account as the
Worker; see [Sign-in delivery](./SIGNIN.md#email-sign-in-delivery).

The sender and email footer links can move with the website. They are not
federated identities, and this change does not alter `FEDERATION_DOMAIN` or
any existing actor URI.

### The surface root is `pana.social`, not `panamia.club`

`PANAVERSE_ROOT_DOMAIN` named `panamia.club` until this was corrected, so the root domain named a host this app does not serve. `originForFrom` builds every cross-surface link, `metadataBase` and `canonical` from it, and falls back to the configured root whenever the current host is not under it. Production runs on `pana.social`, which was not under `panamia.club`, so that fallback fired on every request:

```
host=pana.social -> www    : https://panamia.club         curl exit 35  (cert expired)
                 -> social : https://social.panamia.club  curl exit 28  (timeout)
```

Both cross-surface targets were dead. It was never live — the deployed build predates the panaverse work — so this was caught before shipping rather than after.

Pana Social is therefore `social.pana.social`. Making the surface root equal the identity domain also retires a standing hazard instead of arming one; see `lib/federation/domain.ts`.

## The two roles of `pana.social`

The same string does two unrelated jobs, and only one of them is a web address.

| Role                   | Examples                                                                                    | Safe to repoint? |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| **Web origin**         | `og:url`, JSON-LD `url`, sitemap, RSS/JSON feeds, `policy.json` endpoints                   | Yes, at cutover  |
| **Federated identity** | `@user@pana.social`, actor/status/follow URIs, WebFinger, NIP-05, `wss://relay.pana.social` | **No. Ever.**    |

Identity URIs are stored by remote servers as permanent primary keys. Once an actor has federated, changing the domain orphans it: the fediverse sees a brand-new account, and the ActivityPub `Move` activity that repairs it carries followers but **not** posts. `lib/federation/domain.ts` documents this in depth and is the authority on the identity side.

## Why find-and-replace is the specific hazard

Counting occurrences across `app/`, `lib/` and `components/`:

```
total 'pana.social'        114  in 66 files
  web origin (https://)     29  in 20 files
    env-guarded              8   <- follows NEXT_PUBLIC_HOST_URL, needs no edit
    request-guarded          1   <- falls back from the Origin header
    HARDCODED               20   in 11 files  <- the only ones needing edits
  identity / other          85
```

**85 of 114 occurrences are identity.** A global replace corrupts 85 correct values in order to fix 20. It will look obviously right in review, and federation breakage is silent and permanent — remote servers never re-resolve a URI they have already stored.

**Under the current plan, none of the 20 need editing.** They already name `pana.social`, which is both the live host and the surface root, so there is no pending migration — the inventory below is a map for a hypothetical future move, not a task list. If the web surface ever does move, migrate those 20 explicitly, by hand, and leave the other 94 alone.

## Inventory of hardcoded web origins

These have no environment variable to follow, so they must be edited directly at cutover.

| File                                        | Lines                                 | Notes                                           |
| ------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `app/legal/terms/page.tsx`                  | 6                                     | `const SITE`                                    |
| `app/legal/privacy/page.tsx`                | 7                                     | `const SITE`                                    |
| `app/legal/dmca/page.tsx`                   | 5                                     | `const SITE`                                    |
| `app/legal/breach/page.tsx`                 | 4                                     | `const SITE`                                    |
| `app/legal/accessibility/page.tsx`          | 4                                     | `const SITE`                                    |
| `app/legal/page.tsx`                        | 8                                     | `const SITE`                                    |
| `app/legal/terms/policy.json`               | 8, 45, 51, 57, 63, 69, 75, 81, 87, 93 | **JSON — cannot carry a warning comment**       |
| `app/legal/privacy/policy.json`             | 8                                     | **JSON — cannot carry a warning comment**       |
| `components/legal/JsonLd.tsx`               | 36                                    | structured-data publisher URL                   |
| `lib/email-templates/layout.ts`             | 44                                    | email footer moved to `panamia.club` 2026-10-25 |
| `app/api/federation/events/[slug]/route.ts` | 42                                    | **Federation — correct as-is, do not move**     |

The two `policy.json` files are machine-readable policy documents and cannot hold an inline warning. `lib/email-templates/layout.ts` is likewise uncommentable at the line itself — the URL sits inside an HTML template literal, where a comment would render into the email. Those twelve occurrences are listed here precisely because the code cannot warn you in place.

Every other site in this table carries an inline comment pointing back to this document.

The env-guarded sites (`app/sitemap.ts`, `app/robots.ts`, the five feed routes, `app/.well-known/privacy-policy/route.ts`) need **no edit** — set `NEXT_PUBLIC_HOST_URL` and they follow it.

## Launching `social.pana.social`

The repo side is done: `PANAVERSE_ROOT_DOMAIN` is `pana.social` in `wrangler.jsonc`, and `DEFAULT_ROOT_DOMAIN` matches. Hostname binding lives outside the repo — this Worker has no `routes` or `custom_domain` block, so `social.pana.social` was bound as a Custom Domain in the Cloudflare dashboard (2026-09-24) rather than from config.

**`PANAVERSE_SUBDOMAINS` is now `"1"` and Pana Social's front door is `https://social.pana.social`.** That flag gates links only, never routing: with it on, `originForFrom` returns the surface subdomain, so the surface switcher, `metadataBase` and every `canonical` point there. **`/s` keeps working on every hostname regardless** — flipping this moved the front door without moving a single route, so existing `/s` links are not broken. Set it back to `"0"` if the subdomain ever stops resolving; that setting keeps every link on the host in hand, because a link to a host with no record is a dead end rather than a slower route. `*.localhost` is exempt from the flag entirely, so `social.localhost:3002` exercises the subdomain path in dev either way.

**The front door is served at `/`, not redirected to `/s`.** `https://social.pana.social/` renders the feed under that URL; it used to answer `307 → /s`, so the surface had a subdomain but still wore a path prefix in the address bar. The choice is made in `app/page.tsx` from the `Host` header, because both surfaces share one route tree: a route group cannot express this — `app/(social)/page.tsx` still resolves to `/` and collides with the homepage — and a Worker rewrite cannot either, since vinext has no middleware-rewrite signalling and the client router would fetch RSC payloads for a path the server does not think it is on. Branching inside the route keeps URL and route identical. `/s` still serves the feed on every hostname, so nothing that links it breaks; `frontDoorPath` is what decides which of the two a masthead or account tile should name.

1. ~~Add `social.pana.social` as a custom domain on the `panamia-next` Worker.~~ **Done 2026-09-24.** Cloudflare issued the certificate on binding. The pre-existing certs were per-hostname (`pana.social`, `relay.pana.social`, `*.relay.pana.social`) with **no `*.pana.social` wildcard**, which is why the subdomain returned a connection failure rather than a TLS error while unbound — there was no certificate for it at all.
2. ~~Confirm `PANAVERSE_ROOT_DOMAIN=pana.social` in the deployed Worker vars, then set `PANAVERSE_SUBDOMAINS=1`.~~ **Done 2026-09-24**, in that order, after `https://social.pana.social/s` was confirmed to serve. Both vars are pinned in `wrangler.jsonc`, so they apply on deploy rather than needing a dashboard edit. Setting the flag before step 1 resolved would have re-pointed every cross-surface link and canonical URL at a host answering nothing — the state this flag exists to prevent — so the ordering above is the whole point of it.
3. ~~Only then set `PANAVERSE_COOKIE_DOMAIN=".pana.social"`~~ — **already done, ahead of this step.** It is pinned in `wrangler.jsonc`, so it applied on the deploy of `baf61d9` (2026-09-23), before `social.pana.social` existed. The one-time sign-out this step warns about has therefore already been spent, on a deploy made for other reasons.

   This is harmless but worth understanding, because the ordering advice above is no longer available to follow. `.pana.social` is a valid `Domain` for `pana.social` itself, so the apex holds sessions normally and nothing is broken. The _benefit_ — one session spanning both surfaces — only became observable once step 1 bound the subdomain, so it is newly testable rather than proven: sign in on one surface and confirm the other shows you signed in. Do not read a working apex login as evidence on its own.

   Still true from the original note: this also sends the session cookie to `relay.pana.social`.

   **The sign-out's blast radius is larger than it looks, because production has no OAuth providers configured.** Measured against the deployed site on 2026-09-23: `https://pana.social/signin` renders **zero** "Continue with" buttons and opens the email form directly, since `signin-view.tsx` filters to providers whose `NEXT_PUBLIC_*_ENABLED` flag is `'true'` and production sets none. So the magic link is not one way back in, it is the _only_ way back in, for every account at once. The endpoint is wired — `POST /api/auth/sign-in/magic-link` with a malformed address returns `400 VALIDATION_ERROR`, and a wrong path returns `404`, so that 400 is real application logic rather than a catch-all — but **delivery is a separate question that a 400 does not answer.** Send yourself a real magic link and confirm it arrives before treating a cookie-domain change as complete.

4. `NEXT_PUBLIC_HOST_URL` is optional here and is **build-time inlined** (CF-BUILD — see `auth.ts`), so changing it requires a rebuild, not a config edit.
5. **Leave `FEDERATION_DOMAIN=pana.social` pinned.** `lib/panaverse/boot.ts` fails at boot if it is unset on a public host, deliberately.
6. Keep `pana.social` resolving and serving WebFinger and actor JSON indefinitely, whatever happens to the web surface.

`panamia.club` is a separate concern with no dependency on any of the above. It is an older, unrelated deployment, and what becomes of it is a product decision rather than a routing one.

## Launching `connectors.pana.social` and `admin.pana.social`

Both surfaces are registered in `lib/panaverse/surfaces.ts` and both already served on the apex before they had hostnames — `pana.social/connectors` and `pana.social/admin` each returned 200 on 2026-10-07. The binding was the only missing piece, so this was a nicety rather than a repair.

**Done 2026-10-07.** Both are bound as Worker Custom Domains and verified serving:

```
connectors.pana.social/            200  "Pana Connectors"
connectors.pana.social/connectors  200  "Pana Connectors | Pana MIA Club"
admin.pana.social/                 307 -> /admin
admin.pana.social/admin            200  "Admin | Pana MIA Club"
```

**The two front doors are not symmetric, and that is by design rather than an oversight.** `app/page.tsx` switches on the resolved surface id, and `connectors` renders `<ConnectorsFrontDoor />` inline the way `social` renders the feed — so `connectors.pana.social/` serves the surface under that URL. `admin` is the one case that redirects, and the reason is layout, not routing: the console's sidebar lives in `app/admin/layout.tsx`, which a page sitting at the route-tree root never receives. Rendering it inline would serve the console without its chrome. So `admin.pana.social/` wears a path prefix in the address bar and `admin.pana.social/admin` is the real console. Retiring that redirect means lifting the sidebar out of the admin layout, not adding a branch.

That switch is exhaustive over `surface.id` on purpose: a newly registered surface fails to compile until this file says what its front door is, instead of silently inheriting another surface's homepage. It consults the hostname only, never `PANAVERSE_SUBDOMAINS`, so `connectors.localhost` exercises the same branch without DNS.

Certificates are still issued per hostname on binding — the cert now presented on both subdomains is `CN=pana.social` carrying them as SANs, valid to 2026-11-17. There is still **no `*.pana.social` wildcard**, which is why an unbound subdomain fails at connection rather than with a TLS warning: there is no certificate for it at all, the same symptom social showed before 2026-09-24.

**Nothing linked to these hosts while they were unbound, so there was no ordering hazard to respect.** This is the one way they differed from social's launch, where the ordering of steps 1 and 2 was the whole point: `PANAVERSE_SUBDOMAINS` was already `"1"` and both surfaces were already in the registry, yet the account-menu tile for the console is `{ id: 'admin', href: '/admin' }` in `lib/panaverse/sites.ts` — a relative path, which stays on the host in hand. The subdomains began serving the moment they resolved, and `/connectors` and `/admin` keep working on every hostname either way.

**Binding is dashboard work, and wrangler's OAuth token cannot do it.** Measured 2026-10-07: that token manages script secrets — `wrangler secret put` succeeds — but returns **403** on both `GET /accounts/{account}/workers/domains` and `GET /zones/{zone}/dns_records`. The account is not the problem: zone `pana.social` (`0e91bbfa…`, active) and the Worker are both in `Gschriss@gmail.com's Account`. Binding needs the dashboard, or an API token carrying Workers and DNS edit.

Workers & Pages → `panamia-next` → Settings → Domains & Routes → Add → Custom Domain:

- ~~`connectors.pana.social`~~ **Done 2026-10-07.**
- ~~`admin.pana.social`~~ **Done 2026-10-07.**

Cloudflare creates the DNS record and issues the certificate on binding. Expect a short window where DNS answers but HTTP does not — and beware the local negative DNS cache: probing a host while it is still unbound caches the `NXDOMAIN`, and the OS resolver will keep failing after the record exists. `Clear-DnsClientCache` before concluding a binding did not take. A `try/catch` around `Resolve-DnsName` is not a check either; it returns non-A records without throwing, so inspect the returned record rather than the absence of an exception.

`GET /zones/{zone}/workers/routes` returned no pattern routes on 2026-10-07, confirming every hostname here is bound as a Custom Domain rather than by route pattern. That is why this Worker still has no `routes` block in `wrangler.jsonc`, and why adding one is a change of convention rather than a tidy-up.

## Events is path-only

Pana Events is served at **`pana.social/e`**, and `events.pana.social` is not planned. It is registered in `lib/panaverse/surfaces.ts` as the `events` surface with `rootPath: '/e'` and **`subdomain: null`** — and that null is the entire mechanism. `originFor` and `originForFrom` both fall through to the root domain for a surface without a subdomain, so every link to Events resolves to `pana.social/e` regardless of which host the reader is standing on. `www` has always worked this way; Events is the second surface to want it. A surface is a thing with its own name, mark and tone, not a thing with its own hostname.

**It shipped as `subdomainPending: true` first, and the difference is worth keeping straight.** That flag freezes a surface's links on _the host in hand_, which is the right answer for a subdomain that is coming but not yet bound — nothing points at a name DNS cannot resolve while the record catches up. It is the wrong answer for a surface that is never getting one. From `admin.pana.social` the Events link resolved to `admin.pana.social/e`, so choosing Events out of the switcher left the reader on the admin hostname, under the PanaAdmin masthead, reading a page the guest header had to apologise for. A pending surface has nowhere better to point; a path-only surface has `pana.social`. `subdomainPending` stays in the registry for the next surface launched subdomain-first, but nothing sets it today.

**Dev now matches production here.** `events.localhost` used to resolve to the surface, because `*.localhost` is exempt from the subdomain flag and resolves without DNS. With no subdomain to resolve there is nothing to exempt, so the local front door is `localhost:3002/e` — the same shape as the deployed one, which is what you want from a surface whose production form has no hostname to rehearse.

**The guest header learned about this too.** `SurfaceGuestHeader` offers "Open on {owner}" over a page one surface is borrowing from another, and it builds that href from `originForFrom`. While Events was `subdomainPending` that produced `https://admin.pana.social/e` from admin and `https://pana.social/e` from the apex — the page already being read, wearing an external-link icon. With `subdomain: null` the link leaves properly for `pana.social/e`. The guard added alongside it stays: when the owner's origin matches the one in hand the header drops the link rather than render it inert, which still happens for a genuinely origin-less surface — one that is pending, any surface while `PANAVERSE_SUBDOMAINS` is off, or any of them reached from a host outside the root domain.

**If this is ever reversed,** do it in this order, because the opposite order points live links at a name that does not resolve: add `events.pana.social` as a Custom Domain on the `panamia-next` Worker (Cloudflare issues the certificate on binding; until then the host returns a connection failure rather than a TLS error, because the pre-existing certs are per-hostname with no `*.pana.social` wildcard), confirm it serves, **then** set `subdomain: 'events'` and deploy. Set `subdomainPending: true` in the same commit if the two steps cannot ship together, since `PANAVERSE_SUBDOMAINS` is already `"1"` and would otherwise re-point links, `metadataBase` and `canonical` at the new host the moment it is named. Nothing else moves: `PANAVERSE_COOKIE_DOMAIN` is already `.pana.social`, so sessions span the new host with no sign-out; `auth.ts` derives `trustedOrigins` from `SURFACES`, so the origin was trusted the moment the surface was registered; and `worker/index.ts` and `lib/panaverse/chrome.ts` are generic over surfaces, so Events would get its own masthead without a per-surface branch.

**The front door is `/e`, and `/events` is a different page that stays on www.** `/e` is the calendar — `/e/new`, `/e/[slug]`, `/e/[slug]/manage` — and it is what every minted event link already points at, so it had to be the surface root. `/events` is the 27-line marketing `OfferingFrontPage` and keeps living on the apex. This is the same split as Social's `/s` versus its apex front door, and both prefixes are claimed in the surface's `paths`.

**Known side effect, and it is intended:** `surfaceForPath('/e')` now resolves to Events, so `pana.social/e` renders wearing the Pana Events masthead instead of `MainHeader`. `/s` has behaved this way since Social launched.

**Events was removed from `SHARED_ROOMS` in `lib/panaverse/branding.ts`.** It was listed there as a room that _could_ become a surface; it is one now, and leaving it in both lists would have printed it twice in the switcher.

## Known issues

**`panamia.club` apex TLS certificate expired 2024-07-24** (~790 days ago as of 2026-09-22).

```
Subject  : CN=panamia.club
Issuer   : CN=R3, O=Let's Encrypt
NotAfter : 2024-07-24 13:19:24
SAN      : DNS Name=panamia.club     (apex only — which is why www is unaffected)
```

Anyone typing the bare brand domain gets a full-page browser security interstitial. Because `www` is healthy, visitors arriving from links or search never see it, which is why it has stayed invisible for over two years.

**Root cause is a split A record, not a lapsed subscription.** The apex resolves to two addresses — `76.76.21.21` (Vercel) and `192.64.119.168` (Namecheap). ACME HTTP-01 validation round-robins between them, and the Namecheap address `302`s `/.well-known/acme-challenge/` away to `www`, which does not serve the token. Roughly half of every renewal attempt therefore fails. `www` renews without trouble because its CNAME has a single target — same registrar, same ACME, and the only difference is the split record. Deleting the stale `192.64.119.168` record should let renewal self-heal; no certificate needs buying. Vercel additionally `308`s `http://panamia.club` to `https://panamia.club`, i.e. into its own dead certificate, so there is no working plaintext fallback either.
