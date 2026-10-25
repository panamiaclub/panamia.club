import { eq, isNotNull, or } from 'drizzle-orm';
import { socialActors, type SocialActor } from '@/lib/schema';

// Profile ownership survives a domain change. The domain fallback also keeps
// local group/service actors, which do not have personal profiles.
export function isLocalActor(
  actor: Pick<SocialActor, 'profileId' | 'domain'>,
  localDomain: string
): boolean {
  return actor.profileId != null || actor.domain === localDomain;
}

export function localActorFilter(localDomain: string) {
  return or(
    isNotNull(socialActors.profileId),
    eq(socialActors.domain, localDomain)
  );
}
