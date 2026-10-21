/**
 * Environment Variable Configuration
 *
 * Single source of truth for all environment variables used in the application.
 * This file documents each variable and where it should be configured:
 *
 * - SECRET: GitHub Secrets (sensitive, encrypted).
 *           On Cloudflare Workers → `wrangler secret put`.
 * - VAR:    GitHub Variables (non-sensitive, visible in logs).
 *           On Cloudflare Workers, routing depends on the optional `cfTarget`
 *           field (inferred from the name when unset — see EnvCfTarget):
 *             - 'runtime' (default for non-NEXT_PUBLIC_*): declare in
 *                `vars` block in wrangler.jsonc. Read at request time.
 *             - 'build'   (default for NEXT_PUBLIC_*):    set in CF dashboard
 *                Build variables. Inlined into the bundle at build time.
 *           Do NOT set runtime vars via the CF dashboard — CF Workers Builds
 *           wipes dashboard plaintext vars on each deploy.
 * - LOCAL:  Only needed for local development.
 *
 * Usage:
 * - Run `npm run env:check` to validate required variables
 *   and that wrangler.jsonc `vars` is in sync with envConfig's runtime VARs.
 * - Run `npm run env:workflow` to generate GitHub Actions snippet
 */

export type EnvLocation = 'SECRET' | 'VAR' | 'LOCAL';

/**
 * For VAR-location vars on Cloudflare Workers, where the value lives:
 *   - 'runtime': declared in wrangler.jsonc `vars` block. Read at request time.
 *   - 'build':   set in CF dashboard Build variables. Inlined into the bundle
 *                at build time by Vite (NEXT_PUBLIC_* and similar).
 *
 * Default (when `cfTarget` is unset): NEXT_PUBLIC_* → 'build', everything else → 'runtime'.
 * Set explicitly to override the default.
 */
export type EnvCfTarget = 'runtime' | 'build';

export interface EnvVarConfig {
  description: string;
  location: EnvLocation;
  required: boolean;
  cfTarget?: EnvCfTarget;
  defaultValue?: string;
  example?: string;
  docsUrl?: string;
}

export const envConfig: Record<string, EnvVarConfig> = {
  // =============================================================================
  // DATABASE
  // =============================================================================
  POSTGRES_URL: {
    description:
      'Supabase PostgreSQL connection string (direct or session-mode pooler). ' +
      'In Cloudflare Workers this is overridden by the HYPERDRIVE binding. ' +
      'Do NOT use the transaction-mode pooler (port 6543) — it breaks prepared statements.',
    location: 'SECRET',
    required: true,
    example:
      'postgresql://postgres:[PASSWORD]@db.[project-ref].supabase.co:5432/postgres',
    docsUrl: 'https://supabase.com/docs/guides/database/connecting-to-postgres',
  },
  POSTGRES_DIRECT_URL: {
    description:
      'Supabase direct (unpooled) connection string — used only by drizzle-kit migrate. ' +
      'Never used by the app at runtime.',
    location: 'SECRET',
    required: false,
    example:
      'postgresql://postgres:[PASSWORD]@db.[project-ref].supabase.co:5432/postgres',
    docsUrl: 'https://supabase.com/docs/guides/database/connecting-to-postgres',
  },

  // =============================================================================
  // AUTHENTICATION (better-auth)
  // =============================================================================
  BETTER_AUTH_SECRET: {
    description:
      'better-auth encryption secret (generate with: openssl rand -base64 32)',
    location: 'SECRET',
    required: true,
  },
  BETTER_AUTH_URL: {
    description: 'Base URL for better-auth callbacks',
    location: 'VAR',
    required: true,
    defaultValue: 'http://localhost:3000',
  },

  // =============================================================================
  // HOST CONFIGURATION
  // =============================================================================
  NEXT_PUBLIC_HOST_URL: {
    description: 'Public-facing site URL',
    location: 'VAR',
    required: true,
    defaultValue: 'http://localhost:3000',
  },

  FEDERATION_DOMAIN: {
    description:
      'Canonical fediverse identity domain — the domain in @user@domain handles ' +
      'and the origin of every ActivityPub actor/status/follow URI this instance ' +
      'mints. Remote servers store those URIs as permanent keys, so this is ' +
      'effectively write-once: changing it after an actor has federated orphans ' +
      'it, and the Move migration that repairs it carries followers but NOT posts. ' +
      'Kept separate from NEXT_PUBLIC_HOST_URL so the UI can move to a dedicated ' +
      'social hostname without re-minting identities. Whatever host serves the app, ' +
      'THIS domain must answer /.well-known/webfinger and serve /p/[user] as ' +
      'ActivityPub JSON. Defaults to the NEXT_PUBLIC_HOST_URL hostname.',
    location: 'VAR',
    required: false,
    example: 'pana.social',
  },

  PANAVERSE_ROOT_DOMAIN: {
    description:
      'Registrable domain the panaverse surfaces hang off. Each surface in ' +
      'lib/panaverse/surfaces.ts is a subdomain of this (social.<root>, …), and ' +
      'the Worker uses it to route a surface hostname to that surface. Defaults ' +
      'to pana.social. Unset or unmatched hosts — localhost, *.workers.dev — ' +
      'fall back to the main site with every route reachable, as before surfaces.',
    location: 'VAR',
    required: false,
    example: 'pana.social',
  },

  PANAVERSE_SUBDOMAINS: {
    description:
      'Set to "1" once each surface subdomain has a DNS record and is bound to ' +
      'this Worker — dashboard work outside this repo, see docs/DOMAINS.md. ' +
      'Until then leave it unset: cross-surface links, metadataBase and every ' +
      'canonical URL stay on the host currently being served, so Pana Social is ' +
      'reached at /s rather than at a social.<root> that resolves nowhere. A ' +
      'link to a host with no record is a dead end, not a slower route, so the ' +
      'unset default is the safe one. Routing does not depend on this — every ' +
      'surface route answers on every hostname — so flipping it moves the front ' +
      'door, not the routes. *.localhost is exempt and keeps its subdomains.',
    location: 'VAR',
    required: false,
    example: '1',
  },

  PANAVERSE_COOKIE_DOMAIN: {
    description:
      'Cookie domain shared by the panaverse surfaces, so one sign-in carries ' +
      'across pana.social and social.pana.social. Leave unset to keep ' +
      'host-only cookies, which is how every existing session was issued — ' +
      'setting this re-scopes cookies and signs current users out once, so do ' +
      'it as part of launching the social surface, not before. Must be the ' +
      'registrable domain, which now also carries the fediverse identity host: ' +
      'a ".pana.social" cookie is sent to relay.pana.social as well.',
    location: 'VAR',
    required: false,
    example: '.pana.social',
  },

  // =============================================================================
  // ADMIN
  // =============================================================================
  ADMIN_EMAILS: {
    description: 'Comma-separated list of admin email addresses',
    location: 'SECRET',
    required: true,
    example: 'admin1@example.com,admin2@example.com',
  },

  // =============================================================================
  // OAUTH PROVIDERS - Credentials
  // =============================================================================
  GOOGLE_CLIENT_ID: {
    description: 'Google OAuth client ID',
    location: 'VAR',
    required: false,
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  GOOGLE_CLIENT_SECRET: {
    description: 'Google OAuth client secret',
    location: 'SECRET',
    required: false,
  },
  APPLE_CLIENT_ID: {
    description: 'Apple OAuth client ID (Services ID)',
    location: 'VAR',
    required: false,
    docsUrl:
      'https://developer.apple.com/account/resources/identifiers/list/serviceId',
  },
  APPLE_CLIENT_SECRET: {
    description: 'Apple OAuth client secret (signed JWT)',
    location: 'SECRET',
    required: false,
  },
  WIKIMEDIA_CLIENT_ID: {
    description: 'Wikimedia OAuth client ID',
    location: 'VAR',
    required: false,
    docsUrl:
      'https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration',
  },
  WIKIMEDIA_CLIENT_SECRET: {
    description: 'Wikimedia OAuth client secret',
    location: 'SECRET',
    required: false,
  },
  MASTODON_INSTANCE: {
    description: 'Mastodon instance URL for OAuth',
    location: 'VAR',
    required: false,
    defaultValue: 'https://mastodon.social',
  },
  MASTODON_CLIENT_ID: {
    description: 'Mastodon OAuth client ID',
    location: 'VAR',
    required: false,
  },
  MASTODON_CLIENT_SECRET: {
    description: 'Mastodon OAuth client secret',
    location: 'SECRET',
    required: false,
  },

  // =============================================================================
  // OAUTH PROVIDERS - UI Visibility (NEXT_PUBLIC_*)
  // =============================================================================
  NEXT_PUBLIC_GOOGLE_ENABLED: {
    description: 'Show Google sign-in button',
    location: 'VAR',
    required: false,
    defaultValue: 'false',
  },
  NEXT_PUBLIC_APPLE_ENABLED: {
    description: 'Show Apple sign-in button',
    location: 'VAR',
    required: false,
    defaultValue: 'false',
  },
  NEXT_PUBLIC_WIKIMEDIA_ENABLED: {
    description: 'Show Wikimedia sign-in button',
    location: 'VAR',
    required: false,
    defaultValue: 'false',
  },
  NEXT_PUBLIC_MASTODON_ENABLED: {
    description: 'Show Mastodon sign-in button',
    location: 'VAR',
    required: false,
    defaultValue: 'false',
  },

  // =============================================================================
  // OAUTH PROVIDERS - Trust Level
  // Values: trusted | verification-required | disabled
  // =============================================================================
  OAUTH_GOOGLE: {
    description: 'Google OAuth trust level',
    location: 'VAR',
    required: false,
    defaultValue: 'trusted',
  },
  OAUTH_APPLE: {
    description: 'Apple OAuth trust level',
    location: 'VAR',
    required: false,
    defaultValue: 'trusted',
  },
  OAUTH_WIKIMEDIA: {
    description: 'Wikimedia OAuth trust level',
    location: 'VAR',
    required: false,
    defaultValue: 'verification-required',
  },
  OAUTH_MASTODON_SOCIAL: {
    description: 'Mastodon.social OAuth trust level',
    location: 'VAR',
    required: false,
    defaultValue: 'trusted',
  },

  // =============================================================================
  // TURNSTILE (Cloudflare)
  // =============================================================================
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: {
    description:
      'Cloudflare Turnstile site key (public). ' +
      'Client builds inline it when available; the Turnstile hook also reads ' +
      'it from a runtime config endpoint for Cloudflare deployments.',
    location: 'VAR',
    required: true,
    docsUrl: 'https://dash.cloudflare.com/?to=/:account/turnstile',
  },
  TURNSTILE_SECRET_KEY: {
    description: 'Cloudflare Turnstile secret key',
    location: 'SECRET',
    required: true,
  },

  // =============================================================================
  // MAPS (Esri active; Stadia parked)
  // =============================================================================
  NEXT_PUBLIC_STADIA_API_KEY: {
    description:
      'Stadia Maps API key for the directory and profile basemaps (public). ' +
      'Currently inert: the basemap is Esri World Street Map, which needs ' +
      'no key, because every Stadia request for this account returns 401 by ' +
      'domain auth and by API key alike, on tiles and on unrelated endpoints, ' +
      'so the property is not authorised yet. Once it is, set this only if ' +
      'domain auth cannot apply (callers with no Origin/Referer, such as ' +
      'server-side or native); browser traffic should authenticate by domain. ' +
      'Public by design — it travels in every tile URL — so lock it to the ' +
      'site domain in the Stadia dashboard rather than treating it as a ' +
      'secret. Inlined at build time, so if set it must be in CF Build ' +
      'variables (not Runtime).',
    location: 'VAR',
    required: false,
    docsUrl: 'https://client.stadiamaps.com/dashboard/',
  },

  // =============================================================================
  // EMAIL (Cloudflare Email Sending)
  // https://developers.cloudflare.com/email-service/
  // =============================================================================
  EMAIL_SENDER_ADDRESS: {
    description:
      'Sender email address (From: header). ' +
      'Non-secret — visible in every outbound email. ' +
      'Baked into the bundle by Vite at build time. Must be in CF Build variables.',
    location: 'VAR',
    required: false,
    example: 'hola@pana.social',
  },
  EMAIL_SENDER_NAME: {
    description:
      'Sender display name. ' +
      'Baked into the bundle by Vite at build time. Must be in CF Build variables.',
    location: 'VAR',
    required: false,
    defaultValue: 'Pana MIA',
  },
  EMAIL_ENV: {
    description:
      'Email environment — "PROD" enables real sends via CF Email binding, ' +
      'anything else logs to console (default: DEV)',
    location: 'VAR',
    required: false,
    defaultValue: 'DEV',
  },

  // =============================================================================
  // OBJECT STORAGE (Cloudflare R2)
  // =============================================================================
  R2_ACCOUNT_ID: {
    description: 'Cloudflare account ID (used for R2 S3-compatible endpoint)',
    location: 'SECRET',
    required: true,
    docsUrl: 'https://dash.cloudflare.com/?to=/:account/r2',
  },
  R2_ACCESS_KEY_ID: {
    description: 'R2 API token key ID (create under R2 → Manage R2 API Tokens)',
    location: 'SECRET',
    required: true,
    docsUrl: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
  },
  R2_SECRET_ACCESS_KEY: {
    description: 'R2 API token secret',
    location: 'SECRET',
    required: true,
    docsUrl: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
  },
  R2_BUCKET_NAME: {
    description: 'R2 bucket name (e.g. panamia-media)',
    location: 'VAR',
    required: true,
    docsUrl: 'https://dash.cloudflare.com/?to=/:account/r2',
  },
  R2_PUBLIC_URL: {
    description:
      'Public base URL for the R2 bucket (r2.dev subdomain or custom domain)',
    location: 'VAR',
    required: true,
    docsUrl: 'https://developers.cloudflare.com/r2/buckets/public-buckets/',
  },

  // =============================================================================
  // STRIPE (Payments — server-side only, no client-side Stripe.js)
  // =============================================================================
  STRIPE_SECRET_KEY: {
    description: 'Stripe secret key (server-side Checkout Session creation)',
    location: 'SECRET',
    required: false,
    docsUrl: 'https://dashboard.stripe.com/apikeys',
  },
  STRIPE_WEBHOOK_SECRET: {
    description:
      'Signing secret for the shop Stripe webhook at /api/shop/webhook',
    location: 'SECRET',
    required: false,
    docsUrl: 'https://dashboard.stripe.com/webhooks',
  },
  SHOP_USE_MOCK_PRODUCTS: {
    description:
      'Set to 1 to show the non-purchasable preview catalog instead of Stripe products',
    location: 'VAR',
    required: false,
    example: '1',
  },

  // =============================================================================
  // CLOUDFLARE STREAM (Events livestreaming setup)
  // https://dash.cloudflare.com → Stream → Live Inputs
  // =============================================================================
  CF_ACCOUNT_ID: {
    description:
      'Cloudflare account ID — required to call the Stream API for live input creation',
    location: 'SECRET',
    required: false,
    docsUrl: 'https://dash.cloudflare.com',
  },
  CF_STREAM_API_TOKEN: {
    description:
      'Cloudflare Stream API token with Live Inputs write permission',
    location: 'SECRET',
    required: false,
    docsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  CF_STREAM_WEBHOOK_SECRET: {
    description:
      'Secret used to verify Cloudflare Stream webhook requests. ' +
      'Configure in CF dashboard → Stream → Webhooks → Signing Secret.',
    location: 'SECRET',
    required: false,
  },
  CF_STREAM_CUSTOMER_CODE: {
    description:
      'Customer subdomain code for Stream embed URLs ' +
      '(the XXXX in customer-XXXX.cloudflarestream.com). ' +
      'Found in CF dashboard → Stream → Overview.',
    location: 'VAR',
    required: false,
  },

  // =============================================================================
  // GHL (GoHighLevel CRM)
  // =============================================================================
  GHL_API_KEY: {
    description:
      'GHL private integration API key. ' +
      'Used by the privacy portal and admin community SMS campaigns. ' +
      'The token needs contact read/write plus conversation/message write scopes. ' +
      'Create in GHL → Settings → Integrations → Private Integrations.',
    location: 'SECRET',
    required: false,
    docsUrl: 'https://app.gohighlevel.com',
  },
  GHL_LOCATION_ID: {
    description:
      'GHL sub-account/location ID. ' +
      'Shown in the GHL dashboard URL and in Settings. ' +
      'Not sensitive, but stored as a CF Workers secret (via `wrangler secret put`) ' +
      'for symmetry with GHL_API_KEY and because it needs to survive deploys.',
    location: 'SECRET',
    required: false,
    docsUrl: 'https://app.gohighlevel.com',
  },
  GHL_WORKFLOW_TEST_ID: {
    description:
      'GHL workflow UUID to enroll the current user into via the "Trigger test workflow" ' +
      'button in Advanced Settings. Auto-generated by GHL — copy from the workflow URL in ' +
      'GHL → Automation → Workflows. Leave unset in production to disable the test button.',
    location: 'VAR',
    required: false,
    example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    docsUrl: 'https://app.gohighlevel.com',
  },

  // =============================================================================
  // DMCA AGENT (Legal)
  // https://dmca.copyright.gov — Register/renew designated agent ($6, every 3 years)
  // These values are rendered into legal pages dynamically.
  // =============================================================================
  DMCA_AGENT_NAME: {
    description: 'DMCA agent full name (rendered into legal/dmca/policy.html)',
    location: 'VAR',
    required: false,
    docsUrl: 'https://dmca.copyright.gov',
  },
  DMCA_AGENT_EMAIL: {
    description: 'DMCA agent email for takedown notices',
    location: 'VAR',
    required: false,
    example: 'dmca@pana.social',
  },
  DMCA_AGENT_ADDRESS: {
    description:
      'DMCA agent physical address (use a registered agent service, not personal address)',
    location: 'VAR',
    required: false,
  },
  DMCA_AGENT_PHONE: {
    description: 'DMCA agent phone number',
    location: 'VAR',
    required: false,
    example: '+1-000-000-0000',
  },
  DMCA_REGISTRATION_DATE: {
    description:
      'Date of DMCA agent registration with the Copyright Office (YYYY-MM-DD)',
    location: 'VAR',
    required: false,
    example: '2026-01-01',
  },
  DMCA_RENEWAL_DATE: {
    description:
      'Next DMCA agent renewal date — 3 years from registration (YYYY-MM-DD)',
    location: 'VAR',
    required: false,
    example: '2029-01-01',
  },

  // =============================================================================
  // NOSTR / RESILIENCE RELAY (panamia-nosflare)
  // Crosspost + NIP-29 relay ops. All optional — crosspost is best-effort and
  // no-ops when unconfigured. On Cloudflare Workers the relay is reached via the
  // RELAY service binding in wrangler.jsonc (not an env var); RELAY_INTERNAL_URL
  // is the HTTP fallback used in local dev / when the binding is absent.
  // =============================================================================
  CROSSPOST_AUTH_TOKEN: {
    description:
      'Shared secret authenticating panamia → relay crosspost and internal ' +
      'relay calls. Must match the relay Worker CROSSPOST_AUTH_TOKEN. Required ' +
      'for article/event crossposting to succeed; crosspost no-ops without it.',
    location: 'SECRET',
    required: false,
    // Generate a 256-bit random shared secret; set the same value on the relay.
    example: 'openssl rand -hex 32',
  },
  NOSTR_HOME_RELAY: {
    description:
      "This instance's authoritative home relay (wss URL). nostr_event_id is " +
      'recorded only when this relay accepts the crosspost. Must match the ' +
      'relay Worker NOSTR_HOME_RELAY.',
    location: 'VAR',
    required: false,
    defaultValue: 'wss://relay.pana.social',
    example: 'wss://relay.pana.social',
  },
  RELAY_INTERNAL_URL: {
    description:
      "HTTP URL of the relay Worker's internal endpoint, used as a fallback " +
      'when the RELAY service binding is unavailable (local dev, non-Worker ' +
      'contexts). On CF Workers the RELAY service binding is preferred.',
    location: 'VAR',
    required: false,
    example:
      'https://panamia-nosflare.<account>.workers.dev/internal/crosspost',
  },
  RELAY_PUBLIC_KEY: {
    description:
      "The relay's hex x-only Nostr public key. Non-sensitive. Used to label " +
      'NIP-56 abuse reports that target the relay itself in the moderation UI. ' +
      "Derive it from the relay's secret key (the value set as the relay " +
      'Worker NOSTR_PRIVATE_KEY).',
    location: 'VAR',
    required: false,
    // With nak (github.com/fiatjaf/nak): derive the x-only pubkey from the sec.
    example: 'nak key public <relay-nsec-or-hex-sec>   # 64-hex output',
  },

  // =============================================================================
  // MOBILE APPS (Capacitor native shell — see docs/MOBILE-ROADMAP.md)
  // =============================================================================
  ANDROID_APP_CERT_FINGERPRINTS: {
    description:
      'Comma-separated SHA-256 signing certificate fingerprints, served in ' +
      '/.well-known/assetlinks.json so Android verifies App Links for the app. ' +
      'Expect at least TWO: with Play App Signing, Google re-signs the upload, ' +
      'so shipped builds carry the Play signing certificate while internal-test ' +
      'and local builds carry the upload certificate. Both are listed under ' +
      'Release > Setup > App signing in the Play Console. Not secret — this file ' +
      'is world-readable by design. Unset means the route 404s, which is correct ' +
      'for any environment with no signed build: links simply open in the browser.',
    location: 'VAR',
    required: false,
    example:
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    docsUrl:
      'https://developer.android.com/training/app-links/verify-android-applinks',
  },
  APPLE_APP_TEAM_ID: {
    description:
      'Apple Developer Team ID, served in /.well-known/apple-app-site-association ' +
      'so iOS verifies Universal Links for the app. Found on the membership page ' +
      'of the Apple Developer account. Not secret. Unset means the route 404s, so ' +
      'links open in Safari rather than in the app.',
    location: 'VAR',
    required: false,
    example: 'A1B2C3D4E5',
    docsUrl:
      'https://developer.apple.com/documentation/xcode/supporting-associated-domains',
  },

  // =============================================================================
  // DEVELOPMENT / TESTING
  // =============================================================================
  DEV_RECEIVER_EMAIL: {
    description:
      'Development email redirect - ALL emails sent here instead of real recipients',
    location: 'LOCAL',
    required: false,
  },
  DEBUG_REQUEST_LOG: {
    description:
      'Set to "1" to turn on verbose per-request logging: every SQL statement ' +
      '(lib/db.ts) and the session-resolution breadcrumb (auth.ts). Off by ' +
      'default because these fire on every request and Workers Logs bills per ' +
      'event past the included allowance. Errors are logged regardless, via the ' +
      'observability block in wrangler.jsonc — this only controls the ' +
      'successful-path chatter. Turn on while investigating, then turn it back off.',
    location: 'VAR',
    required: false,
    example: '1',
    docsUrl: 'https://developers.cloudflare.com/workers/observability/logs/',
  },
};

/**
 * Get all variables that should be GitHub Secrets
 */
export function getSecrets(): string[] {
  return Object.entries(envConfig)
    .filter(([, config]) => config.location === 'SECRET')
    .map(([name]) => name);
}

/**
 * Get all variables that should be GitHub Variables
 */
export function getVars(): string[] {
  return Object.entries(envConfig)
    .filter(([, config]) => config.location === 'VAR')
    .map(([name]) => name);
}

/**
 * Resolve the CF target for a given VAR entry. Explicit `cfTarget` wins;
 * otherwise NEXT_PUBLIC_* defaults to 'build' and everything else to 'runtime'.
 * Only meaningful for entries with location === 'VAR'.
 */
export function getCfTarget(name: string, config: EnvVarConfig): EnvCfTarget {
  if (config.cfTarget) return config.cfTarget;
  return name.startsWith('NEXT_PUBLIC_') ? 'build' : 'runtime';
}

/**
 * Get all VAR-location entries whose values are read at runtime on CF —
 * these must appear in wrangler.jsonc `vars` to survive deploys.
 */
export function getCfRuntimeVars(): string[] {
  return Object.entries(envConfig)
    .filter(
      ([name, config]) =>
        config.location === 'VAR' && getCfTarget(name, config) === 'runtime'
    )
    .map(([name]) => name);
}

/**
 * Get all required variables
 */
export function getRequired(): string[] {
  return Object.entries(envConfig)
    .filter(([, config]) => config.required)
    .map(([name]) => name);
}

/**
 * Check for missing required environment variables
 * Returns array of missing variable names
 */
export function checkEnv(): { missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const [name, config] of Object.entries(envConfig)) {
    const value = process.env[name];
    if (config.required && !value) {
      missing.push(name);
    } else if (!config.required && !value && config.location !== 'LOCAL') {
      // Optional but might be useful
    }
  }

  return { missing, warnings };
}

/**
 * Generate GitHub Actions workflow env snippet
 */
export function generateWorkflowSnippet(): string {
  const lines: string[] = ['env:'];

  // Secrets first
  const secrets = Object.entries(envConfig)
    .filter(([, config]) => config.location === 'SECRET')
    .sort(([a], [b]) => a.localeCompare(b));

  if (secrets.length > 0) {
    lines.push('  # Secrets');
    for (const [name] of secrets) {
      lines.push(`  ${name}: \${{ secrets.${name} }}`);
    }
  }

  // Then vars
  const vars = Object.entries(envConfig)
    .filter(([, config]) => config.location === 'VAR')
    .sort(([a], [b]) => a.localeCompare(b));

  if (vars.length > 0) {
    lines.push('  # Variables');
    for (const [name] of vars) {
      lines.push(`  ${name}: \${{ vars.${name} }}`);
    }
  }

  return lines.join('\n');
}
