import { permanentRedirect } from 'next/navigation';

/**
 * The old multi-page profile editor was retired in favor of the Public profile
 * section in Account Settings. Keep one catch-all redirect so bookmarks,
 * notification links, and old clients can never render the retired UI.
 */
export default function RetiredProfileEditor() {
  permanentRedirect('/account/user/edit#profile');
}
