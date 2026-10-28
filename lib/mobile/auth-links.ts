import { MOBILE_APP_ID } from './app-identity';
import { DEFAULT_ROOT_DOMAIN } from '../panaverse/root-domain';

export const MOBILE_MAGIC_LINK_PATH = '/signin/mobile';
export const MAGIC_LINK_VERIFY_PATH = '/api/auth/magic-link/verify';
export const NATIVE_LAUNCH_URL_KEY = 'pana.mobile.launch-url';

function magicLinkUrl(value: string, pathname: string): URL {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== pathname ||
    url.searchParams.getAll('token').length !== 1 ||
    !url.searchParams.get('token')
  ) {
    throw new Error('Invalid mobile sign-in link');
  }
  return url;
}

export function mobileMagicLinkUrl(verificationUrl: string): string {
  const url = magicLinkUrl(verificationUrl, MAGIC_LINK_VERIFY_PATH);
  url.pathname = MOBILE_MAGIC_LINK_PATH;
  return url.href;
}

export function magicLinkVerificationUrl(mobileUrl: string): string {
  const url = magicLinkUrl(mobileUrl, MOBILE_MAGIC_LINK_PATH);
  url.pathname = MAGIC_LINK_VERIFY_PATH;
  return url.href;
}

export function mobileMagicLinkAppUrl(mobileUrl: string): string {
  magicLinkUrl(mobileUrl, MOBILE_MAGIC_LINK_PATH);
  const url = new URL(`${MOBILE_APP_ID}://auth/magic-link`);
  url.searchParams.set('url', mobileUrl);
  return url.href;
}

export function mobileMagicLinkIntentUrl(mobileUrl: string): string {
  const appUrl = mobileMagicLinkAppUrl(mobileUrl);
  return `${appUrl.replace(`${MOBILE_APP_ID}:`, 'intent:')}#Intent;scheme=${MOBILE_APP_ID};package=${MOBILE_APP_ID};end`;
}

export function isAppUrl(url: URL, appOrigin: string): boolean {
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return false;
  }
  if (url.origin === appOrigin) return true;
  return (
    url.protocol === 'https:' &&
    !url.port &&
    (url.hostname === DEFAULT_ROOT_DOMAIN ||
      url.hostname.endsWith(`.${DEFAULT_ROOT_DOMAIN}`))
  );
}

export function nativeDeepLinkUrl(
  value: string,
  appOrigin: string
): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol === `${MOBILE_APP_ID}:`) {
      if (
        url.hostname !== 'auth' ||
        url.pathname !== '/magic-link' ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        url.searchParams.getAll('url').length !== 1
      ) {
        return null;
      }
      const target = magicLinkUrl(
        url.searchParams.get('url') ?? '',
        MOBILE_MAGIC_LINK_PATH
      );
      return isAppUrl(target, appOrigin) ? target : null;
    }
    return isAppUrl(url, appOrigin) ? url : null;
  } catch {
    return null;
  }
}

export async function nativeLaunchUrlFingerprint(url: string): Promise<string> {
  // HTTP LAN previews lack SubtleCrypto even though the native bridge works.
  const { sha256 } = await import('@noble/hashes/sha2.js');
  return Array.from(sha256(new TextEncoder().encode(url)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function rememberNativeLaunchUrl(url: string): Promise<void> {
  // Store only a fingerprint: the launch URL can contain a one-time email token.
  sessionStorage.setItem(
    NATIVE_LAUNCH_URL_KEY,
    await nativeLaunchUrlFingerprint(url)
  );
}
