// Push providers and lock screens never receive names, message bodies, or URLs.
export function pushAlert(notificationId: string) {
  return {
    title: 'Pana Mia',
    body: 'You have a new notification.',
    notificationId,
  };
}

export function pushDestination(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return '/updates';
  return value;
}
