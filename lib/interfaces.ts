export interface PronounsInterface {
  sheher?: boolean;
  hehim?: boolean;
  theythem?: boolean;
  none?: boolean;
  other?: boolean;
  other_desc?: string;
}

export interface ProfileStatusInterface {
  submitted?: Date;
  approved?: Date;
  published?: Date;
  notes?: string;
}

export interface ProfileGenteDePanaInterface {
  code?: string;
  percentage?: string;
  details?: string;
}

export interface ProfileSocialsInterface {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  twitter?: string;
  spotify?: string;
}

export interface AddressInterface {
  name: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  hours?: string;
  lat?: string;
  lng?: string;
  google_place_id?: string;
}

export interface CountyInterface {
  palm_beach: boolean;
  broward: boolean;
  miami_dade: boolean;
}

export interface ProfileImagesInterface {
  primary?: string;
  primaryCDN?: string;
  gallery1?: string;
  gallery1CDN?: string;
  gallery2?: string;
  gallery2CDN?: string;
  gallery3?: string;
  gallery3CDN?: string;
}

export interface CategoryInterface {
  products: boolean;
  services: boolean;
  events: boolean;
  music: boolean;
  food: boolean;
  clothing: boolean;
  accessories: boolean;
  art: boolean;
  digital_art: boolean;
  tech: boolean;
  health_beauty: boolean;
  wellness: boolean;
  non_profit: boolean;
  homemade: boolean;
}

export interface MentoringInterface {
  enabled: boolean;
  expertise: string[];
  languages: string[];
  bio: string;
  videoIntroUrl?: string;
  goals?: string;
  hourlyRate?: number;
}

/**
 * Profile Descriptions JSONB structure
 */
export interface ProfileDescriptions {
  details?: string;
  background?: string;
  fiveWords?: string;
  tags?: string;
  hearaboutus?: string;
}

/**
 * Profile Mentoring JSONB structure
 */
export type ProfileMentoring = MentoringInterface;

/**
 * International address structure
 */
export interface InternationalAddress {
  name?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  hours?: string;
}

export interface ProfileInterface {
  id?: string;
  _id: string;
  userId?: string | null; // PostgreSQL User.id; null for a directory listing
  email: string;
  name: string;
  screenname?: string; // From User.screenname
  /** Hex x-only Nostr pubkey, set once the profile completes relay enrollment. */
  nostrPubkey?: string;
  active?: boolean;
  /**
   * True for an online business without a public storefront. Suppresses exact
   * distance and directions; the directory may show its approximate base ZIP.
   * Owner-set, never inferred from a missing street address.
   */
  online_only?: boolean;
  /** Drizzle/raw schema name — present when the API returns the unmapped row. */
  onlineOnly?: boolean;
  status?: ProfileStatusInterface;
  locally_based: string;
  details: string;
  background?: string;
  hearaboutus?: string;
  affiliate?: string;
  socials: ProfileSocialsInterface;
  phone_number: string;
  /** Drizzle/raw schema name — present when the API returns the unmapped row. */
  phoneNumber?: string;
  whatsapp_community?: boolean;
  pronouns?: PronounsInterface;
  five_words: string;
  tags?: string;
  counties: CountyInterface;
  categories: CategoryInterface;
  primary_address: AddressInterface;
  /**
   * Flat address columns as they come back from /api/getProfile, which returns
   * the raw Drizzle row rather than the nested `primary_address` shape. Both
   * are declared because different profile endpoints return different shapes.
   */
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressPostalCode?: string | null;
  addressHours?: string | null;
  addressLat?: string | null;
  addressLng?: string | null;
  gentedepana: ProfileGenteDePanaInterface;
  geo: object;
  locations: [];
  images?: ProfileImagesInterface;
  linked_profiles: [];
  mentoring?: MentoringInterface;
  /** Default CC license pre-selected when composing new Articles and posts. */
  defaultCcLicense?: 'cc-by-4' | 'cc-by-sa-4' | 'cc-0';
  createdAt: Date;
  updatedAt: Date;
}

export interface SignupInterface {
  _id: string;
  email: string;
  name: string;
  signupType: string;
  acknowledged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStatusInterface {
  locked?: boolean;
}

export type AccountType = 'directory' | 'personal' | 'hybrid' | 'other';

export interface UserInterface {
  _id: string;
  email: string;
  screenname?: string;
  name?: string;
  accountType?: AccountType;
  status?: UserStatusInterface;
  affiliate: {
    activated: boolean;
    code: string;
    accepted_tos: Date;
    tier: number;
    points: number;
  };
  alternate_emails?: [];
  notificationPreferences?: NotificationPreferencesInterface;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pagination {
  count: number;
  per_page: number;
  offset: number;
  page_number: number;
  total_pages: number;
}

/**
 * UPSTREAM REFERENCE: external/activities.next/lib/database/types/
 * ActivityPub-shaped notification for future federation
 */
export type NotificationActivityType =
  | 'Invite'
  | 'Accept'
  | 'Reject'
  | 'Create'
  | 'Update'
  | 'Delete'
  | 'Announce'
  | 'Like'
  | 'Follow'
  | 'Undo'
  | 'Join'
  | 'Remove'
  | 'Block';

export type NotificationContext =
  | 'coauthor'
  | 'review'
  | 'article'
  | 'mentoring'
  | 'mention'
  | 'follow'
  | 'message'
  | 'system'
  | 'event'
  | 'group'
  | 'group_membership';

export interface NotificationInterface {
  _id: string;
  type: NotificationActivityType;
  actor: string;
  object?: string;
  target: string;
  context: NotificationContext;
  actorScreenname?: string;
  actorName?: string;
  objectType?:
    'article' | 'profile' | 'session' | 'comment' | 'event' | 'venue' | 'group';
  objectTitle?: string;
  objectUrl?: string;
  message?: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPreferencesInterface {
  coauthorInvites: boolean;
  reviewRequests: boolean;
  articlePublished: boolean;
  articleReplies: boolean;
  revisionNeeded: boolean;
  mentoringRequests: boolean;
  systemAnnouncements: boolean;
}

/**
 * Article Types
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/database/types/
 * Article schema designed for future ActivityPub federation
 */
export type ArticleType =
  'business_update' | 'community_commentary' | 'staff_update';

export type ArticleStatus =
  'draft' | 'pending_review' | 'revision_needed' | 'published' | 'removed';

export interface CoAuthorInterface {
  userId: string;
  invitedAt: Date;
  invitationMessage?: string;
  status: 'pending' | 'accepted' | 'declined';
  acceptedAt?: Date;
}

export interface ReviewChecklistInterface {
  factsVerified: boolean;
  sourcesChecked: boolean;
  communityStandards: boolean;
}

export interface ReviewCommentInterface {
  id: string;
  text: string;
  contentRef?: string;
  createdAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface ReviewRecordInterface {
  userId: string;
  requestedAt: Date;
  invitationMessage?: string;
  status: 'pending' | 'approved' | 'revision_needed';
  checklist: ReviewChecklistInterface;
  comments: ReviewCommentInterface[];
  approvedAt?: Date;
}

export interface ArticleInterface {
  _id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  coverImage?: string;
  coverImageAlt?: string;
  articleType: ArticleType;
  tags: string[];
  authorId: string;
  coAuthors: CoAuthorInterface[];
  reviewedBy?: ReviewRecordInterface;
  inReplyTo?: string;
  status: ArticleStatus;
  publishedAt?: Date;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
  readingTime: number;
  mastodonPostUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Social Timeline Types
 * @see docs/SOCIAL-ROADMAP.md Phase 4
 */

export interface SocialStatusDisplay {
  id: string;
  uri: string;
  type?: string;
  content: string;
  contentWarning?: string | null;
  published: string | Date | null;
  /**
   * When this drops out of every feed, for the DM countdown chip.
   *
   * Only direct messages and stories carry one; everything else is null. The
   * server has always sent this column -- it is part of the status row -- and
   * the chat view is the first client that needs to read it, because a DM
   * conversation erodes from the oldest message forward rather than expiring
   * as a unit. See DM_EXPIRY_DAYS in lib/federation/wrappers/status.ts.
   */
  expiresAt?: string | Date | null;
  repliesCount: number;
  likesCount: number;
  liked: boolean;
  actor: {
    id: string;
    username: string;
    domain: string;
    name?: string | null;
    iconUrl?: string | null;
    /**
     * Self-declared county, already resolved to a label by the server. Absent
     * for remote actors and for members who have not set an address; a card
     * should read that as "no badge" rather than substituting a placeholder.
     */
    county?: string | null;
  };
  inReplyTo?: {
    id: string;
    uri: string;
    actorUsername: string;
  } | null;
  /**
   * The group this was posted in, when it was posted in one.
   *
   * Present so a card can say where a post came from. Absent or null means an
   * ordinary personal post -- a card must not treat a missing group as a
   * reason to hide anything, because the server has already decided what this
   * viewer may see before the post reached here.
   */
  group?: {
    id: string;
    handle: string;
    name: string | null;
    visibility: string;
  } | null;
  recipientTo?: unknown;
  recipientCc?: unknown;
  attachments?: Array<{
    id: string;
    type: string;
    mediaType?: string | null;
    url: string;
    name?: string | null;
    width?: number | null;
    height?: number | null;
    peaks?: number[] | null;
  }>;
  location?: {
    type: 'Place';
    latitude?: number;
    longitude?: number;
    name?: string;
    precision?: 'precise' | 'general';
  } | null;
  ccLicense?: 'cc-by-4' | 'cc-by-sa-4' | 'cc-0' | null;
}

export interface SocialActorDisplay {
  id: string;
  username: string;
  domain: string;
  uri?: string;
  name?: string | null;
  summary?: string | null;
  iconUrl?: string | null;
  followingCount: number;
  followersCount: number;
  statusCount: number;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  createdAt?: Date | string;
}
