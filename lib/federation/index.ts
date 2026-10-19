/**
 * Social Module
 *
 * This module provides social features for panamia.club,
 * using ActivityPub for federation with Mastodon, Pixelfed, etc.
 *
 * IMPORTANT: The external/activities.next/ directory is READ-ONLY.
 * All integration happens through wrapper modules in this directory.
 *
 * @see docs/SOCIAL-ROADMAP.md for implementation details
 */

// Re-export submodules
export * from './gates';
export * from './crypto/keys';
export * from './wrappers/actor';
export * from './wrappers/status';
export * from './wrappers/follow';
export * from './wrappers/group';
export * from './wrappers/group-members';
export * from './wrappers/group-moderation';
export * from './wrappers/group-notify';
export * from './wrappers/group-visibility';
export * from './wrappers/timeline';
export * from './wrappers/stories';
export * from './wrappers/block';
export * from './wrappers/dm-gate';
export {
  verify as verifyHttpSignature,
  parse as parseHttpSignature,
} from './crypto/verify';
export { sign as signHttpRequest, signedHeaders } from './crypto/sign';
export {
  fetchRemoteActor,
  ensureRemoteActor,
  getRemotePublicKey,
  resolveSignaturePublicKey,
} from './wrappers/remote-actor';
export { getFederationDomain, DEFAULT_FEDERATION_DOMAIN } from './domain';

import { getFederationDomain } from './domain';

export const socialConfig = {
  // The identity domain, NOT the UI host. See lib/federation/domain.ts for why
  // these are separate and what breaks if this value ever changes.
  domain: getFederationDomain(),

  // Optional instance metadata (shown to remote ActivityPub servers)
  instanceName: process.env.SOCIAL_INSTANCE_NAME || 'Pana Mia Club',
  instanceDescription: process.env.SOCIAL_INSTANCE_DESCRIPTION,
  adminEmail: process.env.SOCIAL_ADMIN_EMAIL,

  // ActivityPub endpoints
  endpoints: {
    webfinger: '/.well-known/webfinger',
    nodeinfo: '/.well-known/nodeinfo',
    actor: (screenname: string) => `/p/${screenname}`,
    inbox: (screenname: string) => `/p/${screenname}/inbox`,
    outbox: (screenname: string) => `/p/${screenname}/outbox`,
    followers: (screenname: string) => `/p/${screenname}/followers`,
    following: (screenname: string) => `/p/${screenname}/following`,
  },
};

/**
 * Get the full ActivityPub actor URL for a screenname
 */
export function getActorUrl(screenname: string): string {
  return `https://${socialConfig.domain}${socialConfig.endpoints.actor(screenname)}`;
}

/**
 * Get the inbox URL for a screenname
 */
export function getInboxUrl(screenname: string): string {
  return `https://${socialConfig.domain}${socialConfig.endpoints.inbox(screenname)}`;
}

/**
 * Get the outbox URL for a screenname
 */
export function getOutboxUrl(screenname: string): string {
  return `https://${socialConfig.domain}${socialConfig.endpoints.outbox(screenname)}`;
}

/**
 * Get the followers URL for a screenname
 */
export function getFollowersUrl(screenname: string): string {
  return `https://${socialConfig.domain}${socialConfig.endpoints.followers(screenname)}`;
}

/**
 * Get the following URL for a screenname
 */
export function getFollowingUrl(screenname: string): string {
  return `https://${socialConfig.domain}${socialConfig.endpoints.following(screenname)}`;
}
