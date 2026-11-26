export interface PushMessagePreview {
  sender: string;
  excerpt: string;
}

export function pushAlert(
  notificationId: string,
  preview?: PushMessagePreview
) {
  return {
    title: 'Pana Mia',
    body: preview
      ? `${preview.sender}: ${preview.excerpt}`
      : 'You have a new notification.',
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
