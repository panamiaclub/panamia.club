'use client';

import { useState, useMemo } from 'react';
import { useSession } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PostList,
  FollowButton,
  ActorCard,
  SendMessageButton,
} from '@/components/social';
import { useActor, useActorPosts, useFollows } from '@/lib/query/social';
import { Loader2, FileText, Users, UserPlus } from 'lucide-react';

const VALID_TABS = ['posts', 'followers', 'following'] as const;

/**
 * The claimed half of the updates slot.
 *
 * Runs on indigo and owns its own band, because the unclaimed half
 * (ClaimListingCta) already does. The slot is always in the same place with
 * the same treatment; only its contents change with claim status. It used to
 * be a bare white card on cream, which made a claimed listing look like it had
 * a different page section bolted on than an unclaimed one.
 *
 * The posts themselves come from components/social, which /s renders too, so
 * they are restyled for this surface through the .bizprofile-updates scope in
 * globals.css rather than by threading a variant prop down through PostList.
 */
export function SocialSection({ handle }: { handle: string }) {
  const { t } = useTranslation('profile');
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === 'authenticated';
  const searchParams = useSearchParams();

  const tabFromUrl = useMemo(() => {
    const tab = searchParams?.get('tab');
    return tab && VALID_TABS.includes(tab as (typeof VALID_TABS)[number])
      ? tab
      : null;
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState(tabFromUrl || 'posts');

  const { data: actorData, isLoading: actorLoading } = useActor(handle);
  const { data: postsData, isLoading: postsLoading } = useActorPosts(handle);
  // Both lists are only ever shown to a signed-in owner, so skip the fetch
  // entirely for signed-out visitors instead of firing two certain 401s.
  const { data: followingData } = useFollows(
    'following',
    undefined,
    20,
    isAuthenticated
  );
  const { data: followersData } = useFollows(
    'followers',
    undefined,
    20,
    isAuthenticated
  );

  // Don't render anything if still loading or no actor
  if (actorLoading) {
    return (
      <section className="surface-indigo py-16 md:py-24">
        <div className="container mx-auto flex max-w-3xl justify-center px-4">
          <Loader2 className="text-pana-butter h-6 w-6 animate-spin" />
        </div>
      </section>
    );
  }

  if (!actorData?.actor) {
    return null;
  }

  const actor = actorData.actor;

  return (
    <section className="surface-indigo py-16 md:py-24">
      <div className="container mx-auto max-w-3xl px-4" data-rv>
        <div className="mb-10">
          <span className="section-eyebrow">{t('updates.eyebrow')}</span>
          <h2 className="bizprofile-h2 mt-4">{t('updates.heading')}</h2>
        </div>

        <div className="bizprofile-updates">
          {/* Social stats and follow button */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6 text-sm">
              <button
                onClick={() => setActiveTab('posts')}
                className="hover:underline"
              >
                <span className="text-pana-butter font-extrabold">
                  {actor.statusCount}
                </span>{' '}
                <span className="text-xs font-bold tracking-wider text-white/65 uppercase">
                  {t('updates.posts')}
                </span>
              </button>
              {isAuthenticated && (
                <>
                  <button
                    onClick={() => setActiveTab('following')}
                    className="hover:underline"
                  >
                    <span className="text-pana-butter font-extrabold">
                      {actor.followingCount}
                    </span>{' '}
                    <span className="text-xs font-bold tracking-wider text-white/65 uppercase">
                      {t('updates.following')}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('followers')}
                    className="hover:underline"
                  >
                    <span className="text-pana-butter font-extrabold">
                      {actor.followersCount}
                    </span>{' '}
                    <span className="text-xs font-bold tracking-wider text-white/65 uppercase">
                      {t('updates.followers')}
                    </span>
                  </button>
                </>
              )}
            </div>

            {!actorData.isSelf && isAuthenticated && actor.uri && (
              <div className="flex flex-wrap items-center gap-2">
                <SendMessageButton
                  actorId={actor.id}
                  name={actor.name || actor.username}
                />
                <FollowButton
                  username={actor.username}
                  isFollowing={actorData.isFollowing}
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Following/followers are owner-only, so a signed-out visitor has
                exactly one tab. A full-width strip holding a single tab reads
                as a button rather than navigation, so it is dropped. */}
            {isAuthenticated && (
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="posts" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('updates.posts')}
                </TabsTrigger>
                <TabsTrigger
                  value="following"
                  className="flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  {t('updates.following')}
                </TabsTrigger>
                <TabsTrigger
                  value="followers"
                  className="flex items-center gap-2"
                >
                  <Users className="h-4 w-4" />
                  {t('updates.followers')}
                </TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="posts" className="mt-6">
              <PostList
                statuses={postsData?.statuses || []}
                isLoading={postsLoading}
                hasMore={!!postsData?.nextCursor}
                emptyMessage={t('updates.emptyHandle', { handle })}
              />
            </TabsContent>

            {isAuthenticated && (
              <>
                <TabsContent value="following" className="mt-6">
                  {actorData.isSelf ? (
                    <ActorList
                      actors={followingData?.actors || []}
                      type="following"
                    />
                  ) : (
                    <p className="py-8 text-center font-semibold text-white/65">
                      {t('updates.followingPrivate')}
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="followers" className="mt-6">
                  {actorData.isSelf ? (
                    <ActorList
                      actors={followersData?.actors || []}
                      type="followers"
                    />
                  ) : (
                    <p className="py-8 text-center font-semibold text-white/65">
                      {t('updates.followersPrivate')}
                    </p>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </div>
    </section>
  );
}

function ActorList({
  actors,
  type,
}: {
  actors: Array<{
    id: string;
    username: string;
    domain: string;
    name?: string | null;
    iconUrl?: string | null;
  }>;
  type: 'following' | 'followers';
}) {
  const { t } = useTranslation('profile');

  if (actors.length === 0) {
    return (
      <p className="py-8 text-center font-semibold text-white/65">
        {type === 'following'
          ? t('updates.noFollowing')
          : t('updates.noFollowers')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {actors.map((actor) => (
        <ActorCard
          key={actor.id}
          actor={{
            ...actor,
            summary: null,
            followingCount: 0,
            followersCount: 0,
            statusCount: 0,
          }}
          showStats={false}
        />
      ))}
    </div>
  );
}
