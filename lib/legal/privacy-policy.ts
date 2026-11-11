// Derives the privacy UI surfaces from app/legal/privacy/policy.json.
//
// policy.json is the source of truth. The Privacy at a Glance grid and the
// prose tier list on /legal/privacy both read from here, so a category added
// to the JSON shows up in both without a second edit. Historically all three
// were hand-maintained and drifted: the glance grid never received the peer
// tier at all, leaving its "Peer" filter rendering an empty result.
//
// A category's tier and retention class come from where it sits in the JSON,
// not from a field on the category itself:
//   persistentRetentionClasses.<class>  -> persistent
//   temporaryData                       -> temporary / auto_purged
//   peerNetworkingData.<class>          -> peer_networking

import policy from '@/app/legal/privacy/policy.json';

export type Tier = 'persistent' | 'temporary' | 'peer_networking';

export type RetentionClass =
  | 'deletable'
  | 'community_record'
  | 'third_party_synced'
  | 'moderation_record'
  | 'compliance_record'
  | 'auto_purged'
  | 'in_the_wind'
  | 'participant_observed';

export interface CategoryDisplay {
  icon: string;
  source: string;
  purpose: string;
  retention: string;
  sharedWith: string;
  prose: string;
  /** Short plain-language, non-technical gloss shown on every glance card. */
  blurb: string;
}

/** A category as authored in policy.json, before tier/class are attached. */
interface RawCategory {
  name: string;
  label: string;
  module?: string;
  /**
   * A second retention class for phased data (authored in policy.json).
   * Articles, for example, are deletable before the archive threshold and a
   * community record after, so they carry both. The card shows both badges and
   * either class filter matches. The class from JSON position is primary.
   */
  secondaryClass?: RetentionClass;
  data?: string[];
  source: string;
  purpose: string;
  retention: string;
  license?: string[];
  note?: string;
  providers?: string[];
  display: CategoryDisplay;
}

/** A category with its tier and retention class resolved from its position. */
export interface PrivacyCategory extends RawCategory {
  tier: Tier;
  retentionClass: RetentionClass;
}

export interface RetentionClassInfo {
  id: RetentionClass;
  description: string;
  categories: PrivacyCategory[];
}

export interface TierInfo {
  id: Tier;
  label: string;
  description: string;
  classes: RetentionClassInfo[];
}

// policy.json's categories are structurally heterogeneous (only some carry
// license/providers/note), so TS infers a union of per-element shapes rather
// than one type. Narrow at this boundary; RawCategory is the contract.
function asRawCategories(value: unknown): RawCategory[] {
  return value as RawCategory[];
}

function attach(
  categories: RawCategory[],
  tier: Tier,
  retentionClass: RetentionClass
): PrivacyCategory[] {
  return categories.map((c) => ({ ...c, tier, retentionClass }));
}

const persistentClasses: RetentionClassInfo[] = Object.entries(
  policy.persistentRetentionClasses
).map(([id, cls]) => ({
  id: id as RetentionClass,
  description: cls.description,
  categories: attach(
    asRawCategories(cls.categories),
    'persistent',
    id as RetentionClass
  ),
}));

const temporaryClasses: RetentionClassInfo[] = [
  {
    id: policy.temporaryData.retentionClass as RetentionClass,
    description: policy.temporaryData.description,
    categories: attach(
      asRawCategories(policy.temporaryData.categories),
      'temporary',
      policy.temporaryData.retentionClass as RetentionClass
    ),
  },
];

const peerClasses: RetentionClassInfo[] = Object.entries(
  policy.peerNetworkingData.peerNetworkingRetentionClasses
).map(([id, cls]) => ({
  id: id as RetentionClass,
  description: cls.description,
  categories: attach(
    asRawCategories(cls.categories),
    'peer_networking',
    id as RetentionClass
  ),
}));

/** The three data tiers, each with its retention classes and categories. */
export const tiers: TierInfo[] = [
  {
    id: 'persistent',
    label: 'Persistent',
    description: 'Stored for the lifetime of your account or longer.',
    classes: persistentClasses,
  },
  {
    id: 'temporary',
    label: 'Temporary',
    description: policy.temporaryData.description,
    classes: temporaryClasses,
  },
  {
    id: 'peer_networking',
    label: 'Peer',
    description: policy.peerNetworkingData.description,
    classes: peerClasses,
  },
];

/** Every category across every tier, flattened — one entry per glance card. */
export const allCategories: PrivacyCategory[] = tiers.flatMap((t) =>
  t.classes.flatMap((c) => c.categories)
);

export const policyVersion: string = policy.version;
export const policyStatus: string = policy.status;
export const policyEffectiveDate: string = policy.effectiveDate;
export const nativeAgeAssurance = policy.nativeAgeAssurance;

/** Third-party vendor registry, keyed by the names categories reference. */
export const providers = policy.persistentRetentionClasses.third_party_synced
  .providers as {
  name: string;
  purpose: string;
  data: string[];
  deletionMechanism: string;
  providerRetention: string;
}[];

/** Categories belonging to one legal terms module id (see terms/namespaces.json). */
export function categoriesForModule(moduleId: string): PrivacyCategory[] {
  return allCategories.filter((c) => c.module === moduleId);
}
