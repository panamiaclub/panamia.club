/**
 * Canonical fediverse identity domain.
 *
 * Deliberately dependency-free so anything needing the stable identity domain
 * can import it without pulling in the federation barrel (db wrappers, crypto).
 */

/**
 * Used when nothing else resolves. Matches the production domain the first
 * actors were minted under, so an unconfigured environment can never silently
 * re-brand existing identities.
 */
export const DEFAULT_FEDERATION_DOMAIN = 'panamia.club';

/**
 * The domain in `@user@domain` handles, and the origin of every actor, status,
 * follow, and like URI this instance mints.
 *
 * Remote servers store those URIs as permanent primary keys. Once an actor has
 * federated, changing this value orphans it: the fediverse sees a brand new
 * account, and the `Move` migration that repairs it carries followers but NOT
 * posts. Treat this as write-once per environment and pin it explicitly in
 * production.
 *
 * Intentionally independent of NEXT_PUBLIC_HOST_URL. The UI can move to a
 * dedicated social hostname without re-minting identities — which is the whole
 * reason this is a separate variable. Whatever host serves the app, the domain
 * below is the one that must answer WebFinger and serve `/p/[user]` as
 * ActivityPub JSON.
 *
 * Falls back to the UI host's hostname so deployments that predate this
 * variable keep the exact identity they already had.
 */
export function getFederationDomain(): string {
  return getConfiguredFederationDomain() ?? inheritedFederationDomain();
}

/**
 * The federation domain only when it was configured deliberately.
 *
 * The difference matters to anything that treats the federation domain as a
 * *distinct* front door. When `FEDERATION_DOMAIN` is unset we inherit the UI
 * host, so the "identity domain" is the very host already serving the main
 * site — routing it anywhere else would take the main site down with it. A
 * caller that needs "a domain that exists purely for identity" must ask for
 * the configured value and accept null, not take the inherited fallback.
 */
export function getConfiguredFederationDomain(): string | null {
  const explicit = process.env.FEDERATION_DOMAIN?.trim();
  if (!explicit) return null;
  // Accept either a bare hostname or a full URL, and keep any explicit port
  // (local federation testing depends on it).
  return explicit.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

/**
 * The identity domain inferred from the UI host, for deployments that predate
 * `FEDERATION_DOMAIN`.
 *
 * Hazard worth stating plainly, because it is dormant rather than fixed.
 * Today `NEXT_PUBLIC_HOST_URL` is unset in the Worker config, so an
 * environment that lost `FEDERATION_DOMAIN` would still land on
 * DEFAULT_FEDERATION_DOMAIN and mint correct URIs. Setting it to the panaverse
 * surface root is also safe now — but only because that root is panamia.club,
 * the identity domain itself. It re-arms the moment the UI moves to a hostname
 * that is not the identity domain: from then on an unset `FEDERATION_DOMAIN`
 * silently mints every actor under the UI's hostname, and those URIs are
 * permanent.
 *
 * `assertPanaverseConfigured` in lib/panaverse/boot.ts exists to make that
 * combination fail at boot rather than quietly. Do not remove one without the
 * other.
 */
function inheritedFederationDomain(): string {
  const hostUrl = process.env.NEXT_PUBLIC_HOST_URL;
  if (!hostUrl) return DEFAULT_FEDERATION_DOMAIN;

  try {
    return new URL(hostUrl).hostname || DEFAULT_FEDERATION_DOMAIN;
  } catch {
    return DEFAULT_FEDERATION_DOMAIN;
  }
}
