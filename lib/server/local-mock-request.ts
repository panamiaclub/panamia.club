/**
 * True only for fixture routes served from the local machine without a
 * database binding. Production hosts and real application routes must always
 * keep the request-scoped database requirement.
 */
export function isLocalMockRequest(
  url: URL,
  hasDatabaseBinding: boolean
): boolean {
  return (
    !hasDatabaseBinding &&
    url.pathname.startsWith('/mock/') &&
    isLoopbackHostname(url.hostname)
  );
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

export function isLocalMockDependencyRequest(
  url: URL,
  referrer: string | null,
  hasDatabaseBinding: boolean
): boolean {
  if (hasDatabaseBinding || !isLoopbackHostname(url.hostname) || !referrer) {
    return false;
  }

  try {
    const referrerUrl = new URL(referrer);
    return (
      referrerUrl.origin === url.origin &&
      referrerUrl.pathname.startsWith('/mock/')
    );
  } catch {
    return false;
  }
}
