import { getRootDomain } from '@/lib/panaverse/surfaces';

export function getHttpsRedirect(
  url: URL,
  rootDomain = getRootDomain()
): string | null {
  const root = rootDomain.trim().toLowerCase();
  const local =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (
    url.protocol !== 'http:' ||
    local ||
    !(url.hostname === root || url.hostname.endsWith(`.${root}`))
  ) {
    return null;
  }

  const target = new URL(url);
  target.protocol = 'https:';
  return target.href;
}
