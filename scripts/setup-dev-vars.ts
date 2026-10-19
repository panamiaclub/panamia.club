/**
 * Generates .dev.vars from .env.local for wrangler dev / vinext dev.
 *
 * Wrangler reads .dev.vars and injects ALL its entries as env bindings
 * (env.KEY) into the Worker at runtime. This is the standard way to
 * provide local secrets to a Cloudflare Worker dev server.
 *
 * Run once after cloning or updating .env.local:
 *   yarn dev:setup
 *
 * IMPORTANT: once .dev.vars exists it REPLACES .env.local as the env source
 * (the dev server logs "Using secrets defined in .dev.vars"). Any key that is
 * in .env.local but missing from KEYS below is therefore silently dropped, and
 * the value from wrangler.jsonc `vars` applies instead. If you add a var to
 * .env.local that must take effect locally, add it to KEYS too.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parse } from 'dotenv';

const KEYS = [
  'POSTGRES_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ADMIN_EMAILS',
  'TURNSTILE_SECRET_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  // Google OAuth. Both halves must be listed or `dev:setup` drops them and
  // local Google sign-in fails at the token exchange rather than at startup:
  // the client ID would fall back to wrangler.jsonc `vars` while the secret
  // resolved to nothing, so the button renders and only the callback breaks.
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  // Must be carried through even when empty: wrangler.jsonc sets this to
  // ".panamia.club" for production, and browsers reject that cookie domain on
  // a localhost host. An empty value here restores host-only cookies so local
  // sign-in works. Without it, sign-in redirects correctly but lands signed out.
  'PANAVERSE_COOKIE_DOMAIN',
  // Not a live break today: wrangler.jsonc pins this to the same "panamia.club"
  // that .env.local.example ships, so dropping it changed nothing. Carried
  // through so an *explicit* local override survives `dev:setup` — and because
  // an unset value is not inert: lib/federation/domain.ts falls back to the UI
  // host, so a plain `dev` run with no value mints actor URIs under localhost.
  'FEDERATION_DOMAIN',
];

if (!existsSync('.env.local')) {
  console.error('No .env.local found. Create it first.');
  process.exit(1);
}

const env = parse(readFileSync('.env.local'));
// Deliberately `!== undefined` rather than truthy: an empty value is meaningful
// (see PANAVERSE_COOKIE_DOMAIN above) and must be written, not dropped.
const lines = KEYS.filter((k) => env[k] !== undefined).map(
  (k) => `${k}=${env[k]}`
);
writeFileSync('.dev.vars', lines.join('\n') + '\n');
console.log(`Created .dev.vars with ${lines.length} variables.`);
