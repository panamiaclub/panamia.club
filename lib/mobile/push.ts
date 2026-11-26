import { isNativeApp } from './native';

const INSTALLATION_KEY = 'pana-push-installation';
export const PUSH_ENABLED_KEY = 'pana-push-enabled';
export const PUSH_PENDING_KEY = 'pana-push-pending';

export function pushInstallationId() {
  let id = localStorage.getItem(INSTALLATION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_KEY, id);
  }
  return id;
}

let pendingUpdate: Promise<void> = Promise.resolve();

export function updatePushDevice(registration?: {
  platform: string;
  token: string;
}) {
  const update = async () => {
    const response = await fetch('/api/push/devices', {
      method: registration ? 'PUT' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pushInstallationId(), ...registration }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error || 'Could not update push notifications.');
    }
  };
  // Disable/logout must land after an in-flight token renewal. Each caller
  // still observes its own failure; a failure must not poison later updates.
  pendingUpdate = pendingUpdate.then(update, update);
  return pendingUpdate;
}

export async function clearPushOnSignOut() {
  if (
    !isNativeApp() ||
    !window.Capacitor?.isPluginAvailable?.('PushNotifications')
  )
    return;
  localStorage.removeItem(PUSH_PENDING_KEY);
  const { PushNotifications } = await import('@capacitor/push-notifications');
  // Session deletion also cascades server registrations, including remote logout.
  await Promise.all([
    updatePushDevice(),
    localStorage.getItem(PUSH_ENABLED_KEY) === 'true'
      ? PushNotifications.unregister()
      : Promise.resolve(),
    PushNotifications.removeAllDeliveredNotifications(),
  ]);
}
