/**
 * Shared shapes for the push layer.
 *
 * Kept in their own module so apns.ts and fcm.ts can import them without
 * either one importing index.ts, which imports both.
 */

/** What a device is asked to display, before either service's framing. */
export interface PushMessage {
  title: string;
  body: string;
  /**
   * Deep link path within the app, delivered as data rather than shown.
   * Read on tap by components/mobile/PushRegistration.tsx to route the member
   * to the thing the notification is about instead of dropping them on the
   * home screen.
   */
  url?: string;
  /** iOS app icon badge count. Android ignores this; see apns.ts. */
  badge?: number;
}

/**
 * The outcome of one send to one device.
 *
 * `dead` is deliberately separate from `failed`. A failure is transient and
 * the token should be kept for next time; a dead token has been disowned by
 * the platform and will never work again, so keeping it means carrying a
 * known-undeliverable address through every future send. Only `dead` causes
 * a row to be deleted — see lib/push/tokens.ts.
 */
export type PushResult =
  | { status: 'sent' }
  | { status: 'dead'; reason: string }
  | { status: 'failed'; reason: string };
