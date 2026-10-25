/**
 * Derive ActivityPub visibility from recipientTo / recipientCc arrays.
 *
 * Maps the same way Mastodon does:
 *  - `to` contains Public         -> 'public'
 *  - `cc` contains Public          -> 'unlisted'
 *  - has followers URL (no Public) -> 'private'
 *  - else                          -> 'direct'
 */

const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

export type PostVisibility = 'public' | 'unlisted' | 'private' | 'direct';

/** Local mutual-audience notes, distinct from legacy followers-only posts and DMs. */
export const STATUS_TYPE_PANAS = 'Panas';

export function getVisibilityFromRecipients(
  recipientTo: unknown,
  recipientCc: unknown,
  statusType?: string
): PostVisibility {
  if (statusType === STATUS_TYPE_PANAS) return 'private';

  const to = Array.isArray(recipientTo) ? (recipientTo as string[]) : [];
  const cc = Array.isArray(recipientCc) ? (recipientCc as string[]) : [];

  if (to.includes(PUBLIC)) return 'public';
  if (cc.includes(PUBLIC)) return 'unlisted';

  // Private if to contains a followers URL, direct otherwise
  // For simplicity, treat any non-empty to without Public as private
  // unless cc is also empty (pure direct message)
  if (to.length > 0 && to.some((url) => url.includes('/followers'))) {
    return 'private';
  }

  return 'direct';
}
