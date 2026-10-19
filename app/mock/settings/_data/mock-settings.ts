/* Fixtures for the account settings mock.
 *
 * Every field names the column it stands in for, so swapping this mock to live
 * data is mechanical. The shape is taken from what `/account/user/edit`
 * already reads today: `getUserSession()` for the account row, `useProfile()`
 * for the publishing licence, and the HighLevel contact for the marketing
 * record.
 *
 * The member is imported rather than redeclared, for the same reason
 * `_data/panaverse.ts` imports her: there is one account, and a settings page
 * that shows a different person from the feed would be arguing against itself.
 */

import { MOCK_VIEWER } from '../../feed/_data/mock-feed';

/** Where a setting takes effect.
 *
 *  This is the type the redesign is built on. Settings live on one account but
 *  are read by two surfaces, and the page never used to say which — so a member
 *  changing their screenname on panamia.club had no way to know it moved their
 *  fediverse handle on social.panamia.club too. */
export type SettingScope = 'everywhere' | 'social' | 'www';

export const SCOPE_LABEL: Record<SettingScope, string> = {
  everywhere: 'Applies everywhere',
  social: 'Pana Social only',
  www: 'Pana Mia only',
};

export type SectionId =
  | 'identity'
  | 'signin'
  | 'place'
  | 'publishing'
  | 'messages'
  | 'data';

export interface SettingsSection {
  id: SectionId;
  /** Nav label. Short, because the nav is a margin column, not a menu. */
  label: string;
  /** Section heading, which can afford to be a sentence fragment. */
  heading: string;
  lede: string;
  scope: SettingScope;
}

/* Ordered by how often a member comes here for it. Identity first because
   "what is my name and handle" is the reason most people open settings at all;
   data last because it is the section you visit once.

   This replaces the old split, which was "Update Your Account Settings" and an
   accordion called "Advanced Settings". That split described how risky the
   developers felt each control was, not what any of them were about — which is
   how a marketing-consent control with legal weight ended up collapsed behind
   the same summary row as a key rotation. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'identity',
    label: 'Identity',
    heading: 'Who you are',
    lede: 'Your name and screenname travel with every post, article, and listing you touch. Your handle is built from your screenname, so the two can never drift apart.',
    scope: 'everywhere',
  },
  {
    id: 'signin',
    label: 'Sign-in & keys',
    heading: 'How you get in',
    lede: 'One email signs you into every surface. Your Nostr keys sign what you publish, and only you hold them.',
    scope: 'everywhere',
  },
  {
    id: 'place',
    label: 'Where you are',
    heading: 'Where you are',
    lede: 'A ZIP code is enough to sort the directory and the events near you. It is never shown on your profile.',
    scope: 'everywhere',
  },
  {
    id: 'publishing',
    label: 'Publishing',
    heading: 'How your work is licensed',
    lede: 'The licence pre-selected when you compose. You can still change it on any individual article or post.',
    scope: 'everywhere',
  },
  {
    id: 'messages',
    label: 'Messages',
    heading: 'Messages from Pana Mia',
    lede: 'Each channel is a separate choice, and each one can be off without the others. Sign-in links you request yourself are never affected.',
    scope: 'everywhere',
  },
  {
    id: 'data',
    label: 'Your data',
    heading: 'Your data',
    lede: 'What we hold, where it came from, and how to get rid of it.',
    scope: 'everywhere',
  },
];

export interface MockAccount {
  /** users.email — verified at sign-up, changed only by re-verification. */
  email: string;
  /** users.name — optional display name, max 60. */
  name: string;
  /** users.screenname — 3–24, letters, numbers, underscore, hyphen. */
  screenname: string;
  /** users.zip_code — max 10. */
  zipCode: string;
  /** Derived from zip_code by the directory's county lookup. Shown so the
   *  member can tell a typo'd ZIP from a correct one without saving first. */
  county: string;
  /** socialActors.preferredUsername + FEDERATION_DOMAIN. Derived from
   *  screenname, never edited directly — see lib/federation/domain.ts. */
  fediverseHandle: string;
  avatar: string;
  /** users.screennameChangedAt, formatted. Drives the 90-day cooldown copy. */
  screennameChangedAt: string;
}

export const MOCK_ACCOUNT: MockAccount = {
  email: 'claribel.avila@gmail.com',
  name: MOCK_VIEWER.name,
  screenname: MOCK_VIEWER.handle,
  zipCode: '33127',
  /* `county` is optional on MockAuthor because a post can come from an account
     that never set a ZIP. Here it cannot be: this fixture has a ZIP, so the
     lookup that derives the county always has something to work with. */
  county: MOCK_VIEWER.county ?? 'Miami-Dade',
  fediverseHandle: `@${MOCK_VIEWER.handle}@panamia.club`,
  avatar: MOCK_VIEWER.avatar,
  screennameChangedAt: 'March 2024',
};

/** Screennames the availability check rejects, so the mock can demonstrate all
 *  three states without a network call. */
export const TAKEN_SCREENNAMES = ['admin', 'panamia', 'claribel2', 'support'];

/** What a screenname change costs. Stated beside the field rather than inside
 *  the confirmation dialog, which is where the live page puts it — by then the
 *  member has already decided. */
export const SCREENNAME_CONSEQUENCES = [
  'Every timeline post and direct message on the account is deleted. They cannot be recovered.',
  'Articles you have contributed are re-attributed to the new screenname automatically.',
  'Your old screenname is reserved for you and nobody else can claim it.',
  'You can only do this once every 90 days.',
];

/** GHL_DND_CHANNELS in lib/ghl.ts. Spelled as HighLevel requires. */
export interface MarketingChannel {
  key: 'Email' | 'SMS' | 'WhatsApp' | 'Call';
  label: string;
  /** What actually arrives on this channel, so "off" is an informed choice. */
  blurb: string;
  enabled: boolean;
}

export const MARKETING_CHANNELS: MarketingChannel[] = [
  {
    key: 'Email',
    label: 'Email',
    blurb: 'The monthly newsletter, plus announcements about new features.',
    enabled: true,
  },
  {
    key: 'SMS',
    label: 'Text messages',
    blurb: 'Event reminders for markets and mixers you said you were going to.',
    enabled: true,
  },
  {
    key: 'WhatsApp',
    label: 'WhatsApp',
    blurb: 'The same reminders, for panas who prefer WhatsApp to SMS.',
    enabled: false,
  },
  {
    key: 'Call',
    label: 'Phone calls',
    blurb: 'Rare. Only for vendor logistics on an event you are running.',
    enabled: false,
  },
];

/** The HighLevel contact record, as the live page renders it. */
export const MOCK_MARKETING_RECORD = [
  { label: 'Name', value: 'Claribel Ávila', column: 'ghl.contact.firstName' },
  {
    label: 'Email',
    value: 'claribel.avila@gmail.com',
    column: 'ghl.contact.email',
  },
  { label: 'Phone', value: '(305) 555-0148', column: 'ghl.contact.phone' },
  {
    label: 'How you got here',
    value: 'Became a Pana — June 2023',
    column: 'ghl.contact.source',
  },
];

/** CC_LICENSES in components/legal/CCLicensePicker.tsx. */
export interface LicenseOption {
  value: 'cc-0' | 'cc-by-4' | 'cc-by-sa-4';
  label: string;
  spdx: string;
  plain: string;
}

export const LICENSE_OPTIONS: LicenseOption[] = [
  {
    value: 'cc-by-4',
    label: 'CC BY 4.0',
    spdx: 'CC-BY-4.0',
    plain: 'Anyone can reuse it, as long as they credit you.',
  },
  {
    value: 'cc-by-sa-4',
    label: 'CC BY-SA 4.0',
    spdx: 'CC-BY-SA-4.0',
    plain: 'Anyone can reuse it with credit, and has to share it the same way.',
  },
  {
    value: 'cc-0',
    label: 'CC0 1.0',
    spdx: 'CC0-1.0',
    plain: 'Public domain. No credit required.',
  },
];

/** profiles.defaultCcLicense */
export const DEFAULT_LICENSE: LicenseOption['value'] = 'cc-by-4';

/** Settings that are designed into the layout but not built. Held open for the
 *  same reason the profile mock holds space: so the page does not have to be
 *  re-laid-out the week one of them lands. */
export const RESERVED_SETTINGS = [
  {
    title: 'Signed-in devices',
    blurb:
      'Every session on the account, with the surface and the city it signed in from, and a way to end any of them.',
  },
  {
    title: 'Muted and blocked',
    blurb:
      'Handled inside the timeline today. It belongs here too, because it is an account-level list, not a per-post one.',
  },
  {
    title: 'Download your account',
    blurb:
      'A single archive of posts, articles, listings, and images. The delete controls below already imply it exists.',
  },
];
