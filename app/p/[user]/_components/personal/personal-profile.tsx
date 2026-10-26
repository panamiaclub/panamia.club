'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, Lock, Pencil, Store } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import {
  useActor,
  useActorPosts,
  usePanas,
  useProfileEvents,
  useProfileGroups,
  useProfileLists,
} from '@/lib/query/social';
import type {
  PanaSummary,
  ProfileEventSummary,
  ProfileGroupSummary,
  RecommendationListSummary,
} from '@/lib/query/social';
import {
  PostList,
  FollowButton,
  RelationshipBadge,
  SendVoiceMemoButton,
  BlockMenu,
} from '@/components/social';
import { Button } from '@/components/ui/button';
import { isUnoptimizableImageSrc } from '@/lib/image-src';
import type { PersonalProfileView } from '@/lib/server/personal-profile';
import { IdentityRail } from './identity-rail';
import { PERSONAL_TAB_ICONS, PersonalTabs } from './personal-tabs';
import { PanaCard } from './personal-cards';
import {
  EventCard,
  GroupRow,
  RecommendListCard,
} from './personal-content-cards';
import type { PersonalTab, StatDef, TabDef } from './types';

/* The personal (Pana Social) profile.
 *
 * Two columns, inverting the feed's: identity on the left and stays put, work
 * on the right and scrolls. The old layout stacked them, which meant the top
 * third of every screen re-answered "who is this" while the answer to "what
 * have they been up to" started below the fold.
 *
 * Identity comes in as props because the page around this is edge-cached and
 * must stay session-free on the server. Everything social is fetched here on
 * the client instead, which is also what lets Panas and RSVPs vary by viewer
 * without splitting the cache. */
export function PersonalProfile({ profile }: { profile: PersonalProfileView }) {
  const [activeTab, setActiveTab] = useState<PersonalTab>('posts');
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === 'authenticated';

  const handle = profile.handle;
  const { data: actorData } = useActor(handle);
  const { data: postsData, isLoading: postsLoading } = useActorPosts(handle);
  const { data: panasData, isLoading: panasLoading } = usePanas(handle);
  const { data: eventsData, isLoading: eventsLoading } =
    useProfileEvents(handle);
  const { data: groupsData, isLoading: groupsLoading } =
    useProfileGroups(handle);
  const { data: listsData, isLoading: listsLoading } = useProfileLists(handle);

  const actor = actorData?.actor;
  const isSelf = Boolean(actorData?.isSelf);

  const events = eventsData?.events ?? [];
  const groups = groupsData?.groups ?? [];
  const lists = listsData?.lists ?? [];

  /* Upcoming only. A count that included last year's shows would describe a
     history rather than a calendar, and it sits beside "Posts", which is
     unambiguously a running total. */
  const upcomingCount = events.filter(
    (event) => new Date(event.startsAt).getTime() >= Date.now()
  ).length;

  /* Places, not lists. "Recommends 3" would be counting the shelves rather
     than what is on them, and the shelf count is the less interesting half. */
  const recommendCount = lists.reduce((sum, list) => sum + list.itemCount, 0);

  /* How many Panas you have is yours. It reads as a scoreboard to everyone
     else, and a scoreboard is the thing most likely to turn a mutual follow
     from a relationship into a target — see docs/SOCIAL-GRAPH.md. The badge
     on an individual stays public; the aggregate does not. */
  const stats: StatDef[] = [
    ...(isSelf
      ? [
          {
            tab: 'panas' as const,
            label: 'Panas',
            value: panasData?.count ?? null,
          },
        ]
      : []),
    { tab: 'posts', label: 'Posts', value: actor?.statusCount ?? null },
    {
      tab: 'groups',
      label: 'Groups',
      value: groupsData ? groups.length : null,
    },
  ];

  const statValue = (tab: PersonalTab) =>
    stats.find((entry) => entry.tab === tab)?.value ?? null;

  /* Posts lead because that is what people come to a profile for, and every
     public tab after it is something this person made or committed to.
     Panas is the exception — a list of other people rather than of their work
     — which is why it comes last and only for the owner. */
  const tabs: TabDef[] = [
    {
      id: 'posts',
      label: 'Posts',
      icon: PERSONAL_TAB_ICONS.posts,
      count: statValue('posts'),
    },
    {
      id: 'events',
      label: 'Events',
      icon: PERSONAL_TAB_ICONS.events,
      count: eventsData ? upcomingCount : null,
    },
    {
      id: 'groups',
      label: 'Groups',
      icon: PERSONAL_TAB_ICONS.groups,
      count: statValue('groups'),
    },
    {
      id: 'recommends',
      label: 'Recommends',
      icon: PERSONAL_TAB_ICONS.recommends,
      count: listsData ? recommendCount : null,
    },
    ...(isSelf
      ? [
          {
            id: 'panas' as const,
            label: 'Panas',
            icon: PERSONAL_TAB_ICONS.panas,
            count: panasData?.count ?? null,
          },
        ]
      : []),
  ];

  /* A visitor who somehow lands on the Panas tab — a stale render after
     signing out, say — would otherwise be left on a tab with no button. */
  const safeTab: PersonalTab =
    activeTab === 'panas' && !isSelf ? 'posts' : activeTab;

  const isFollowing = Boolean(actorData?.isFollowing);
  const isFollowedBy = Boolean(actorData?.isFollowedBy);
  const isBlocked = Boolean(actorData?.isBlocked);
  const isMuted = Boolean(actorData?.isMuted);

  const actions = renderActions({
    isSelf,
    isAuthenticated,
    actor,
    isFollowing,
    isFollowedBy,
    isBlocked,
    isMuted,
  });

  return (
    <main className="surface-cream min-h-screen pb-20">
      <div className="container mx-auto max-w-6xl px-4 pt-6">
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <IdentityRail
            profile={profile}
            stats={stats}
            actions={actions}
            badge={
              /* Your own profile has no relationship to report, and a signed
                 out viewer has no relationship at all -- the endpoint returns
                 false for both directions, so this would render nothing, but
                 the guard says why rather than leaving it to coincidence. */
              !isSelf && isAuthenticated ? (
                <RelationshipBadge
                  isFollowing={isFollowing}
                  isFollowedBy={isFollowedBy}
                />
              ) : null
            }
            connections={
              isSelf ? (
                <PanasRailModule
                  data={panasData}
                  onSeeAll={() => setActiveTab('panas')}
                />
              ) : (
                /* The visitor's counterpart to the owner's Panas module. It is
                   not the same list with a filter on it: it only contains
                   people the viewer is already Panas with, which is why it can
                   sit on someone else's profile at all. Signed-out viewers have
                   no graph to intersect, so the endpoint returns nothing and
                   the module doesn't render. */
                <MutualPanasRailModule data={panasData?.mutualPanas} />
              )
            }
          />

          <div className="min-w-0">
            <PersonalTabs
              tabs={tabs}
              activeTab={safeTab}
              onSelectTab={setActiveTab}
            />

            <div className="mt-6">
              {safeTab === 'posts' && (
                <Panel id="posts">
                  <PostList
                    statuses={postsData?.statuses || []}
                    isLoading={postsLoading}
                    hasMore={!!postsData?.nextCursor}
                    emptyMessage={`@${handle} hasn't posted anything yet.`}
                  />
                </Panel>
              )}

              {safeTab === 'events' && (
                <Panel id="events">
                  <EventsPanel
                    events={events}
                    isLoading={eventsLoading}
                    canSeeAttending={Boolean(eventsData?.canSeeAttending)}
                    name={profile.name}
                  />
                </Panel>
              )}

              {safeTab === 'groups' && (
                <Panel id="groups">
                  <PanelIntro
                    title="Groups"
                    lede="Communities inside Pana Social — neighborhood crews, crafts, dominoes, whatever people organize around. Only public groups appear here."
                  />
                  <GroupsPanel
                    groups={groups}
                    isLoading={groupsLoading}
                    name={profile.name}
                  />
                </Panel>
              )}

              {safeTab === 'recommends' && (
                <Panel id="recommends">
                  <PanelIntro
                    title="Recommends"
                    lede="Named lists of local businesses this Pana vouches for, in their own words. Every place links to its listing in the directory."
                  />
                  <RecommendsPanel
                    lists={lists}
                    isLoading={listsLoading}
                    name={profile.name}
                    isSelf={isSelf}
                  />
                </Panel>
              )}

              {safeTab === 'panas' && (
                <Panel id="panas">
                  <PanelIntro
                    title="Panas"
                    lede="A Pana is a mutual follow — both people followed each other. Only you can see this list."
                  />
                  <PanasPanel data={panasData} isLoading={panasLoading} />
                </Panel>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function renderActions({
  isSelf,
  isAuthenticated,
  actor,
  isFollowing,
  isFollowedBy,
  isBlocked,
  isMuted,
}: {
  isSelf: boolean;
  isAuthenticated: boolean;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isBlocked: boolean;
  isMuted: boolean;
  actor?: {
    id: string;
    username: string;
    name?: string | null;
    iconUrl?: string | null;
    uri?: string | null;
  };
}): ReactNode {
  if (isSelf) {
    return (
      <Button
        asChild
        variant="outline"
        className="border-pana-ink/20 flex-1 rounded-full font-extrabold"
      >
        <Link href="/account/user/edit#profile">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit profile
        </Link>
      </Button>
    );
  }

  if (!isAuthenticated || !actor?.uri) return null;

  return (
    <>
      <SendVoiceMemoButton
        recipient={{
          id: actor.id,
          username: actor.username,
          displayName: actor.name || actor.username,
          avatarUrl: actor.iconUrl || undefined,
          uri: actor.uri,
        }}
        size="sm"
      />
      <FollowButton
        username={actor.username}
        isFollowing={isFollowing}
        isFollowedBy={isFollowedBy}
        size="sm"
      />
      {/*
        Last in the row, behind an overflow menu, deliberately away from
        Follow. Blocking severs follows both ways and unblocking does not put
        them back, so it should not be reachable by a mis-tap.
      */}
      <BlockMenu
        username={actor.username}
        displayName={actor.name || actor.username}
        isBlocked={isBlocked}
        isMuted={isMuted}
      />
    </>
  );
}

/* Upcoming and past, split.
 *
 * Four upcoming events look identical whether someone turns up constantly or
 * signed up once, so the recent past stays on the page — it is what separates
 * a habit from a plan. */
function EventsPanel({
  events,
  isLoading,
  canSeeAttending,
  name,
}: {
  events: ProfileEventSummary[];
  isLoading: boolean;
  canSeeAttending: boolean;
  name: string;
}) {
  if (isLoading) return <PanelLoading />;

  const now = Date.now();
  const upcoming = events.filter(
    (event) => new Date(event.startsAt).getTime() >= now
  );
  const past = events.filter(
    (event) => new Date(event.startsAt).getTime() < now
  );

  if (events.length === 0) {
    return (
      <EmptyState>
        {firstName(name)} has nothing coming up.
        {!canSeeAttending && (
          <span className="mt-1.5 block font-medium opacity-80">
            Events someone is going to stay private. Only what they host shows
            here.
          </span>
        )}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div className="space-y-3">
          {upcoming.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="rail-heading mb-3">Recently</h3>
          <div className="space-y-3">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupsPanel({
  groups,
  isLoading,
  name,
}: {
  groups: ProfileGroupSummary[];
  isLoading: boolean;
  name: string;
}) {
  if (isLoading) return <PanelLoading />;

  if (groups.length === 0) {
    return (
      <EmptyState>
        {firstName(name)} hasn&rsquo;t joined any public groups yet.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <GroupRow key={group.id} group={group} />
      ))}
    </div>
  );
}

/* Recommendation lists.
 *
 * The empty state has to say which kind of empty it is. A visitor sees only
 * public lists, so "no lists" and "none you can read" look identical from
 * here — and the second is not this pana having nothing to say. The owner
 * gets the other version, which is an invitation rather than a report. */
function RecommendsPanel({
  lists,
  isLoading,
  name,
  isSelf,
}: {
  lists: RecommendationListSummary[];
  isLoading: boolean;
  name: string;
  isSelf: boolean;
}) {
  if (isLoading) return <PanelLoading />;

  if (lists.length === 0) {
    return (
      <EmptyState icon={Store}>
        {isSelf ? (
          <>
            You haven&rsquo;t made any lists yet.
            <span className="mt-1.5 block font-medium opacity-80">
              A list is a few local businesses you vouch for, in your own words.
            </span>
          </>
        ) : (
          <>
            {firstName(name)} hasn&rsquo;t shared any lists.
            <span className="mt-1.5 block font-medium opacity-80">
              Private lists never appear here, so there may be some you
              can&rsquo;t see.
            </span>
          </>
        )}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {lists.map((list) => (
        <RecommendListCard key={list.id} list={list} />
      ))}
    </div>
  );
}

/* One face in a rail module. Shared by the owner's Panas wall and the
   visitor's Mutual Panas, which differ in who they list, not how they look. */
function PanaFace({
  pana,
}: {
  pana: { name?: string | null; username: string; iconUrl?: string | null };
}) {
  const label = pana.name || pana.username;

  return (
    <span
      className="border-pana-ink/10 bg-pana-butter relative block h-10 w-10 overflow-hidden rounded-full border-2"
      title={`${label} (@${pana.username})`}
    >
      {pana.iconUrl ? (
        <Image
          src={pana.iconUrl}
          alt={label}
          fill
          sizes="40px"
          className="object-cover"
          unoptimized={isUnoptimizableImageSrc(pana.iconUrl)}
        />
      ) : (
        <span className="text-pana-ink flex h-full w-full items-center justify-center text-sm font-black">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/* The rail's Panas module: a wall of faces, not a list.
 *
 * Signed-out viewers get the count but no faces, the same split the endpoint
 * draws — how many is an aggregate nobody can impose on anyone, naming who is
 * a social graph. */
function PanasRailModule({
  data,
  onSeeAll,
}: {
  data?: {
    count: number;
    canSeeList: boolean;
    actors: {
      id: string;
      name?: string | null;
      username: string;
      iconUrl?: string | null;
    }[];
  } | null;
  onSeeAll: () => void;
}) {
  if (!data || data.count === 0) return null;

  const shown = data.actors.slice(0, 12);

  return (
    <section className="profile-card p-4">
      <h2 className="rail-heading">Panas</h2>

      {shown.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {shown.map((pana) => (
            <li key={pana.id}>
              <PanaFace pana={pana} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-pana-ink/55 mt-2 text-[12px] leading-snug font-bold">
          You have {data.count.toLocaleString('en-US')}{' '}
          {data.count === 1 ? 'Pana' : 'Panas'}.
        </p>
      )}

      <button
        type="button"
        onClick={onSeeAll}
        className="link-arrow text-pana-indigo mt-3 inline-flex text-[13px] font-extrabold"
      >
        See all Panas
      </button>
    </section>
  );
}

/* Mutual Panas — what a visitor sees where the owner sees their own wall.
 *
 * Every face here is a Pana of the person looking, so this names nobody the
 * viewer doesn't already know and can't be used to read the profile's own
 * Panas. That is the whole reason it may sit on someone else's page while the
 * owner's count may not. See docs/SOCIAL-GRAPH.md.
 *
 * Absent rather than empty when there is no overlap: "0 Mutual Panas" on a
 * stranger's profile is a verdict on the relationship, and a new member would
 * collect that verdict on every profile they open. */
function MutualPanasRailModule({
  data,
}: {
  data?: { count: number; actors: PanaSummary[] } | null;
}) {
  if (!data || data.count === 0) return null;

  const { count, actors } = data;
  /* The API already caps this, but the count is the full overlap and the
     faces are a page of it — so the remainder is computed from what actually
     arrived rather than assumed to be zero. */
  const remaining = count - actors.length;

  return (
    <section className="profile-card p-4">
      <h2 className="rail-heading">Mutual Panas</h2>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {actors.map((pana) => (
          <li key={pana.id}>
            <PanaFace pana={pana} />
          </li>
        ))}
        {remaining > 0 && (
          <li>
            <span
              className="border-pana-ink/10 bg-pana-ink/5 text-pana-ink/70 flex h-10 w-10 items-center justify-center rounded-full border-2 text-[12px] font-black"
              title={`${remaining.toLocaleString('en-US')} more`}
            >
              +{remaining.toLocaleString('en-US')}
            </span>
          </li>
        )}
      </ul>

      <p className="text-pana-ink/55 mt-3 text-[12px] leading-snug font-bold">
        {count.toLocaleString('en-US')} {count === 1 ? 'Pana' : 'Panas'} you
        both know.
      </p>
    </section>
  );
}

/* Owner-only, like the tab that opens it. The one branch worth keeping is the
   disagreement case: if the API says we may not read the list while the page
   has decided we are the owner, the two views of "who is this" have diverged
   and saying so is more use than an empty grid. */
function PanasPanel({
  data,
  isLoading,
}: {
  data?: { count: number; canSeeList: boolean; actors: unknown[] } | null;
  isLoading: boolean;
}) {
  if (isLoading) return <PanelLoading />;

  if (data && !data.canSeeList) {
    return (
      <EmptyState icon={Lock}>
        We couldn&rsquo;t confirm this list is yours.
        <span className="mt-1.5 block font-medium opacity-80">
          Reloading usually sorts it out.
        </span>
      </EmptyState>
    );
  }

  const panas = (data?.actors ?? []) as Parameters<
    typeof PanaCard
  >[0]['pana'][];

  if (panas.length === 0) {
    return (
      <EmptyState>
        You don&rsquo;t have any Panas yet.
        <span className="mt-1.5 block font-medium opacity-80">
          Follow someone who follows you back and they&rsquo;ll show up here.
        </span>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {panas.map((pana) => (
        <PanaCard key={pana.id} pana={pana} />
      ))}
    </div>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

function Panel({ id, children }: { id: PersonalTab; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`profile-panel-${id}`}
      aria-labelledby={`profile-tab-${id}`}
    >
      {children}
    </div>
  );
}

function PanelIntro({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      <p className="text-pana-ink/60 mt-1 max-w-2xl text-[13px] leading-snug font-medium">
        {lede}
      </p>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="text-pana-ink/40 h-6 w-6 animate-spin" />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  children,
}: {
  icon?: typeof Lock;
  children: ReactNode;
}) {
  return (
    <div className="border-pana-ink/10 text-pana-ink/60 rounded-2xl border border-dashed py-12 text-center text-sm font-bold">
      {Icon && (
        <Icon className="mx-auto mb-3 h-5 w-5 opacity-60" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}
