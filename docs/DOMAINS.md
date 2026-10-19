# Domains

`panamia.club` is the canonical domain for the Pana Mia application and its
federated identities. The former pre-launch social domain was retired on
2026-10-19 before production users or external federation identities needed to
be preserved.

## Production contract

| Setting | Value | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `https://panamia.club` | Authentication callbacks |
| `NEXT_PUBLIC_HOST_URL` | `https://panamia.club` | Build-time public origin |
| `PANAVERSE_ROOT_DOMAIN` | `panamia.club` | Canonical web and surface root |
| `PANAVERSE_COOKIE_DOMAIN` | `.panamia.club` | Session sharing across future subdomains |
| `FEDERATION_DOMAIN` | `panamia.club` | ActivityPub and WebFinger identity |
| `NOSTR_HOME_RELAY` | `wss://relay.panamia.club` | First-party Nostr relay |
| `EMAIL_SENDER_ADDRESS` | `hola@panamia.club` | Transactional email sender |

These values must move together. Deployments that serve a public hostname while
`FEDERATION_DOMAIN` is unset fail at boot through `lib/panaverse/boot.ts`.

## Live topology

| Host | State | Purpose |
| --- | --- | --- |
| `panamia.club` | Live | Primary Worker custom domain |
| `www.panamia.club` | Live, `308` to apex | Compatibility hostname |
| `social.panamia.club` | Not bound | Reserved Pana Social front door |
| `connectors.panamia.club` | Not bound | Reserved Pana Connectors front door |
| `admin.panamia.club` | Not bound | Reserved admin front door |
| `relay.panamia.club` | Pending relay migration | Nostr relay Worker |

`PANAVERSE_SUBDOMAINS` remains `"0"` until the reserved surface domains are
bound to the Worker and have active certificates. While it is off, every
surface remains available by path on `panamia.club`:

- Pana Social: `/s`
- Pana Events: `/e`
- Pana Connectors: `/connectors`
- Admin: `/admin`

Bind a surface custom domain before changing `PANAVERSE_SUBDOMAINS` to `"1"`.
Otherwise canonical URLs and cross-surface links will point at a hostname that
does not resolve.

## Federation identity

ActivityPub identifiers are permanent primary keys on remote servers. The
approved pre-launch reset makes identities such as `@member@panamia.club` and
actor URLs under `https://panamia.club` canonical from this point forward.

Do not change `FEDERATION_DOMAIN` after users begin federating. A domain change
creates new identities; ActivityPub `Move` can carry followers but not posts.

The following surfaces must stay aligned with `FEDERATION_DOMAIN`:

- `/.well-known/webfinger`
- ActivityPub actor, status, follow, and event identifiers
- NIP-05 metadata
- relay identity events
- profile handles and federation UI copy
- actor repair and seed scripts

## Relay

The relay is a separate Worker maintained in the
`unitedcolorsofg/panamia-resilience` repository. The main application uses an
optional service binding when both Workers share an account and otherwise
falls back to `https://relay.panamia.club`.

Before enabling relay-dependent publishing:

1. Deploy the relay Worker to the Panamia Cloudflare account.
2. Bind `relay.panamia.club` as its custom domain.
3. Recreate its account-scoped storage and secrets.
4. Restore the `RELAY` service binding in `wrangler.jsonc`.
5. Verify article, event, group, moderation, and identity-event flows.

## Email

`hola@panamia.club` must exist as a mailbox or forwarding alias and must be
authorized for Cloudflare Email Sending before transactional email is treated
as production-ready. Preserve the domain's MX, SPF, DKIM, and DMARC records.

## Mobile and OAuth

The mobile shell loads `https://panamia.club` and accepts navigation to
`*.panamia.club`. Deep-link association files are served from the apex.

Any enabled OAuth provider must allow callback URLs under `panamia.club`.
Google sign-in remains disabled until its client secret and redirect URIs are
configured for the new domain.

## Deployment ownership

The production Worker is deployed by `.github/workflows/deploy-worker.yml` to
Cloudflare account `99a70a6ec57b862e51035de6fd126cea`. Database migrations are
owned separately by `.github/workflows/db-migrate.yml`; the Worker deployment
must not run migrations.

The retired Cloudflare Workers Builds integration must remain disconnected so
only one system deploys production.
