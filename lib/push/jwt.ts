/**
 * JWT signing for push services, on Web Crypto.
 *
 * Both push services authenticate with short-lived JWTs signed by a private
 * key, and both keys arrive as PEM text in an environment variable. This
 * module turns those into `Authorization` header values.
 *
 * Web Crypto rather than node:crypto. `nodejs_compat` is enabled (see
 * wrangler.jsonc) so node:crypto would partly work, but crypto.subtle is the
 * native workerd implementation — no compatibility shim between us and the
 * signature, and no risk of landing on one of the node:crypto surfaces that
 * compat mode only partially implements. Signing is also the one operation
 * here where a subtle difference produces a token that is merely rejected,
 * with no clue as to why.
 *
 * Both token types are cached in module scope. That is safe in a way that
 * caching a database client is not (see lib/db.ts): these are immutable
 * strings, not sockets bound to a request, so sharing them across requests in
 * an isolate carries none of the cross-request I/O hazard. The caching is not
 * only an optimisation in the APNs case — Apple rejects tokens that are
 * refreshed too often as well as ones that are too old, so minting one per
 * request would eventually be throttled.
 */

/** Base64url without padding, per RFC 7515. */
function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlText(value: string): string {
  return base64url(new TextEncoder().encode(value));
}

/**
 * PEM text to the DER bytes crypto.subtle wants.
 *
 * Accepts both real newlines and the literal backslash-n sequences that
 * appear when a key is pasted out of a service account JSON file, or passed
 * through a secret store that escapes them. Getting this wrong produces a key
 * that fails to import with a message saying nothing about newlines, so both
 * forms are normalised rather than documented as a requirement.
 */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');

  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return der.buffer;
}

async function importSigningKey(
  pem: string,
  algorithm: EcKeyImportParams | RsaHashedImportParams
): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToDer(pem), algorithm, false, [
    'sign',
  ]);
}

async function signToken(
  key: CryptoKey,
  algorithm: AlgorithmIdentifier | EcdsaParams,
  data: string
): Promise<string> {
  const signature = await crypto.subtle.sign(
    algorithm,
    key,
    new TextEncoder().encode(data)
  );
  return base64url(signature);
}

// -----------------------------------------------------------------------------
// APNs (ES256)
// -----------------------------------------------------------------------------

/* Apple accepts a token for one hour and rejects refreshes made more often
 * than roughly every twenty minutes. Fifty minutes sits clear of both edges. */
const APNS_TOKEN_TTL_MS = 50 * 60 * 1000;

let apnsCache: { token: string; mintedAt: number } | null = null;

/**
 * A bearer token for APNs, or null when APNs is not configured.
 *
 * Unconfigured is a supported state rather than an error: an environment with
 * no Apple credentials simply does not deliver to iOS, and notifications
 * still land in the database to be read in the app.
 */
export async function getApnsToken(): Promise<string | null> {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APPLE_APP_TEAM_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.trim();

  if (!keyId || !teamId || !privateKey) return null;

  if (apnsCache && Date.now() - apnsCache.mintedAt < APNS_TOKEN_TTL_MS) {
    return apnsCache.token;
  }

  const header = base64urlText(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64urlText(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })
  );

  const key = await importSigningKey(privateKey, {
    name: 'ECDSA',
    namedCurve: 'P-256',
  });

  /* crypto.subtle returns ECDSA signatures as raw r||s, which is exactly the
   * JWS encoding. node:crypto returns DER instead, so code moved between the
   * two runtimes needs a conversion step that is not needed here. */
  const signature = await signToken(
    key,
    { name: 'ECDSA', hash: 'SHA-256' },
    `${header}.${claims}`
  );

  const token = `${header}.${claims}.${signature}`;
  apnsCache = { token, mintedAt: Date.now() };
  return token;
}

// -----------------------------------------------------------------------------
// FCM (RS256, exchanged for an OAuth access token)
// -----------------------------------------------------------------------------

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/* Google issues access tokens with a one hour life. Refreshing at fifty
 * minutes leaves room for clock skew and for the exchange itself. */
const FCM_TOKEN_TTL_MS = 50 * 60 * 1000;

let fcmCache: { token: string; mintedAt: number } | null = null;

/**
 * An OAuth access token for the FCM v1 API, or null when FCM is not
 * configured or the exchange failed.
 *
 * Unlike APNs, the signed JWT is not itself the credential — it is an
 * assertion exchanged with Google for an access token, so this makes a
 * network call on a cache miss.
 */
export async function getFcmAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.trim();

  if (!clientEmail || !privateKey) return null;

  if (fcmCache && Date.now() - fcmCache.mintedAt < FCM_TOKEN_TTL_MS) {
    return fcmCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64urlText(
    JSON.stringify({
      iss: clientEmail,
      scope: FCM_SCOPE,
      aud: FCM_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const key = await importSigningKey(privateKey, {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256',
  });
  const signature = await signToken(
    key,
    'RSASSA-PKCS1-v1_5',
    `${header}.${claims}`
  );

  const response = await fetch(FCM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!response.ok) {
    /* Leave the cache alone so the next send retries rather than inheriting
     * the failure, and let the caller treat this as "FCM unavailable". */
    console.error(
      `[push] FCM token exchange failed: ${response.status} ${await response.text()}`
    );
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) return null;

  fcmCache = { token: data.access_token, mintedAt: Date.now() };
  return data.access_token;
}
