export const NATIVE_TABS = [
  { id: 'directory', label: 'Directory', href: '/d' },
  { id: 'social', label: 'Social', href: '/s' },
  { id: 'community', label: 'Community', href: '/groups' },
  { id: 'profile', label: 'Profile', href: '/account' },
] as const;

export type NativeTab = (typeof NATIVE_TABS)[number]['id'];
export type NativeRootTab = Exclude<NativeTab, 'profile'>;

export interface NativeRoot {
  tab: NativeRootTab;
  view?: 'yours' | 'discover';
  section?: 'all' | 'events' | 'groups';
}

export function nativeRootForPath(
  pathname: string,
  surfaceId = 'www'
): NativeRoot | null {
  if (pathname === '/') {
    return { tab: surfaceId === 'social' ? 'social' : 'directory' };
  }
  if (
    pathname === '/d' ||
    pathname === '/directory/search' ||
    /^\/directory\/search\/[^/]+\/?$/.test(pathname)
  ) {
    return { tab: 'directory' };
  }
  if (pathname === '/s') return { tab: 'social' };
  if (pathname === '/groups') return { tab: 'community' };
  if (pathname === '/groups/discover') {
    return { tab: 'community', view: 'discover', section: 'groups' };
  }
  if (pathname === '/e') {
    return { tab: 'community', view: 'discover', section: 'events' };
  }
  if (pathname === '/s/calendar') {
    return { tab: 'community', view: 'yours', section: 'events' };
  }
  return null;
}

export function usesNativeAppLayout(pathname: string): boolean {
  return !['/signin', '/info', '/mock', '/admin', '/api', '/auth'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function nativeDeepLinkTarget(
  value: string,
  currentOrigin: string,
  rootDomain: string
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.hostname !== rootDomain && !url.hostname.endsWith(`.${rootDomain}`))
  ) {
    return null;
  }
  return url.origin === currentOrigin
    ? `${url.pathname}${url.search}${url.hash}`
    : url.href;
}
