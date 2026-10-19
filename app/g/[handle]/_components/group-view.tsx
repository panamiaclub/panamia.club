'use client';

import Link from 'next/link';
import {
  CalendarDays,
  Check,
  Clock,
  Globe,
  Loader2,
  Lock,
  Settings,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeedPostCard } from '@/app/s/_components/feed-post-card';
import { MemberRow } from '@/components/social/member-row';
import { PostComposer } from '@/components/social/PostComposer';
import {
  useGroup,
  useGroupPosts,
  useGroupEvents,
  useGroupMembers,
  useJoinGroup,
  useLeaveGroup,
  ROSTER_CARD_SIZE,
  type GroupDetailResponse,
} from '@/lib/query/social';

/**
 * A group home page.
 *
 * Follows app/mock/group: cover, square avatar, identity block with a privacy
 * pill, summary, topics, join action, house rules, events, roster and posts.
 *
 * Stacked rather than tabbed, which is where it still departs from the mock.
 * Tabs were rejected in phase 1 because two of the three would have been
 * empty; now that all three are wired the reason has changed rather than
 * disappeared -- a tab hides two thirds of a group from someone deciding
 * whether to join it, and this page's whole job is helping them decide.
 *
 * The mock's stat rail stays dropped. It earned its weight there by being
 * three controls; here the counts it would carry are already in the line
 * under the summary.
 */
export function GroupView({ handle }: { handle: string }) {
  const { data, isLoading, isError } = useGroup(handle);

  if (isLoading) return <GroupSkeleton />;

  /* getSocialData folds 404 into null, so a missing group arrives as data
     being null rather than as an error. The server shell already 404s a bad
     handle, so reaching this means the group vanished between the two. */
  if (isError || !data) {
    return (
      <main className="surface-cream min-h-screen pb-20">
        <div className="container mx-auto max-w-4xl px-4 pt-16">
          <h1 className="text-pana-ink text-2xl font-black">
            This group is not available
          </h1>
          <p className="text-pana-ink/65 mt-2 text-[15px] font-medium">
            It may have been removed, or the link may be wrong.
          </p>
        </div>
      </main>
    );
  }

  return <GroupBody handle={handle} detail={data} />;
}

function GroupBody({
  handle,
  detail,
}: {
  handle: string;
  detail: GroupDetailResponse;
}) {
  const { group, actor, viewer } = detail;

  const isPrivate = group.visibility === 'private';
  const name = actor.name || handle;
  const topics = Object.keys(group.topics ?? {}).filter(
    (topic) => group.topics[topic]
  );
  const rules = Array.isArray(group.rules) ? (group.rules as string[]) : [];

  return (
    <main className="surface-cream min-h-screen pb-20">
      <header>
        {/* No scalloped trim here, matching the profile hero. The cover meets
            the masthead flush: the cover photograph is the subject of this
            page, and notching a bite out of its top edge reads as damage
            rather than as the doily motif it does on a flat colour band. */}
        <div className="profile-cover">
          {/* Plain img rather than next/image: these are remote CDN URLs and
              next.config.js declares no remotePatterns, so the optimizer
              would reject them at runtime. */}
          <img
            src={actor.headerUrl || '/img/bg_coconut_blue.jpg'}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div className="container mx-auto max-w-4xl px-4">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:gap-7">
            {/* Square-ish, not a circle. A circular avatar reads as a person,
                and this page must never be mistaken for somebody's profile. */}
            <div className="profile-avatar" data-shape="group">
              <img
                src={actor.iconUrl || '/img/bg_coconut_blue.jpg'}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1 md:pb-1">
              <h1 className="profile-name">{name}</h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="profile-handle">@{handle}</span>
                <span
                  className="identity-pill"
                  data-tone={isPrivate ? undefined : 'verified'}
                >
                  {isPrivate ? (
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isPrivate ? 'Private group' : 'Open group'}
                </span>
              </div>
            </div>

            <div className="hidden flex-none items-center gap-2 md:flex md:pb-1">
              {viewer.role === 'admin' && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/g/${handle}/settings`}>
                    <Settings className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Settings
                  </Link>
                </Button>
              )}
              <JoinAction handle={handle} group={group} viewer={viewer} />
            </div>
          </div>

          <div className="mt-5 max-w-2xl space-y-4">
            {actor.summary && (
              <p className="text-pana-ink/85 text-[15px] leading-relaxed font-medium">
                {actor.summary}
              </p>
            )}

            <div className="text-pana-ink/60 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" aria-hidden="true" />
                {group.memberCount.toLocaleString('en-US')}
                {group.memberCount === 1 ? ' member' : ' members'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Started{' '}
                {new Date(group.createdAt).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>

            {topics.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <li key={topic}>
                    <span className="identity-pill text-pana-ink/70">
                      #{topic}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 flex items-center gap-2 md:hidden">
            <JoinAction handle={handle} group={group} viewer={viewer} stretch />
            {viewer.role === 'admin' && (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/g/${handle}/settings`}
                  aria-label="Group settings"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl px-4 pt-8">
        {viewer.canRead ? (
          <div className="space-y-4">
            {rules.length > 0 && (
              <section className="border-pana-ink/10 rounded-2xl border bg-white p-5">
                <h2 className="text-pana-ink text-[15px] font-extrabold">
                  House rules
                </h2>
                <ol className="text-pana-ink/75 mt-3 space-y-2 text-[14px] leading-snug font-medium">
                  {rules.map((rule, index) => (
                    <li key={rule} className="flex gap-2">
                      <span className="text-pana-ink/40 font-extrabold">
                        {index + 1}.
                      </span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <GroupEvents
              handle={handle}
              canCreate={viewer.role === 'admin' || viewer.role === 'moderator'}
            />

            <GroupMembers handle={handle} />

            <GroupPosts handle={handle} canPost={viewer.canPost} />
          </div>
        ) : (
          <div className="space-y-4">
            <LockedPanel isPending={viewer.isPending} />
            <GroupLeaders handle={handle} />
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * The group's events.
 *
 * Renders nothing at all when there are none and the viewer could not add
 * one. An empty "Events" heading on every group that has never held one is
 * furniture, not information -- the posts section earns its empty state by
 * being the thing the page is for, this one does not.
 */
function GroupEvents({
  handle,
  canCreate,
}: {
  handle: string;
  canCreate: boolean;
}) {
  const { data, isLoading } = useGroupEvents(handle);
  const events = data?.events ?? [];

  if (isLoading) return null;
  if (events.length === 0 && !canCreate) return null;

  return (
    <section className="border-pana-ink/10 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-pana-ink text-[15px] font-extrabold">Events</h2>
        {canCreate && (
          <Link
            href="/e/new"
            className="text-pana-ink/70 hover:text-pana-ink text-[13px] font-bold"
          >
            Host an event
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-pana-ink/60 mt-3 text-[14px] font-medium">
          No events yet. Yours would be the first.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/e/${event.slug}`}
                className="border-pana-ink/10 hover:border-pana-ink/25 block rounded-xl border p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-pana-ink text-[14px] font-extrabold">
                    {event.title}
                  </span>
                  {event.status !== 'published' && (
                    <span className="text-pana-ink/60 border-pana-ink/15 rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize">
                      {event.status}
                    </span>
                  )}
                </div>
                <p className="text-pana-ink/60 mt-1 text-[13px] font-medium">
                  {new Date(event.startsAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {event.venue ? ` · ${event.venue.name}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The group's posts, plus a composer for members.
 *
 * The composer is gated on `canPost` rather than `canRead`, because a public
 * group is readable by a stranger and writable only by a member -- offering a
 * box that will 403 on submit is worse than not offering one.
 *
 * The empty state does not distinguish "no posts yet" from "nothing you may
 * see", and must not: the server returns an empty timeline in both cases on
 * purpose, and a client that guessed the difference would be reporting on
 * content it was never given.
 */
function GroupPosts({ handle, canPost }: { handle: string; canPost: boolean }) {
  const { data, isLoading } = useGroupPosts(handle);

  const statuses = data?.statuses ?? [];

  return (
    <div className="space-y-4">
      {canPost && (
        <section className="border-pana-ink/10 rounded-2xl border bg-white p-4">
          {/* The same composer as the feed, pinned to this group. It used to
              be a bare textarea, which quietly meant a member could not add a
              content warning, a photo or a licence to anything they wrote
              here -- the group write endpoint accepted all three the whole
              time. */}
          <PostComposer
            lockedGroupHandle={handle}
            placeholder="Share something with the group"
          />
        </section>
      )}

      {isLoading ? (
        <div className="bg-pana-ink/10 h-28 animate-pulse rounded-2xl" />
      ) : statuses.length === 0 ? (
        <section className="border-pana-ink/10 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-pana-ink/65 text-[14px] leading-snug font-medium">
            {canPost
              ? 'No posts yet. Yours would be the first.'
              : 'No posts yet.'}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {statuses.map((status) => (
            <FeedPostCard key={status.id} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The group's roster, abridged.
 *
 * Shows the first page and defers the rest to /g/[handle]/members rather than
 * rendering four hundred rows into the middle of the page. The link carries
 * the total so the decision to follow it is informed -- "See all" alone makes
 * a group of nine look the same as a group of nine hundred.
 *
 * Renders nothing when the roster comes back empty. A group always has at
 * least a founder, so empty here means either the request failed or the
 * group's stored member count has drifted from its rows -- and an empty
 * "Members" card helps with neither. The locked case never reaches this:
 * a viewer who cannot read the roster gets GroupLeaders instead.
 */
function GroupMembers({ handle }: { handle: string }) {
  const { data, isLoading } = useGroupMembers(handle, {
    limit: ROSTER_CARD_SIZE,
  });

  if (isLoading) return null;

  const members = data?.members ?? [];
  if (members.length === 0) return null;

  const total = data?.total ?? members.length;
  const hasMore = total > members.length;

  return (
    <section className="border-pana-ink/10 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-pana-ink text-[15px] font-extrabold">Members</h2>
        {hasMore && (
          <Link
            href={`/g/${handle}/members`}
            className="text-pana-ink/70 hover:text-pana-ink text-[13px] font-bold"
          >
            See all {total.toLocaleString('en-US')}
          </Link>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {members.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </div>
    </section>
  );
}

/**
 * Who runs a private group you cannot see into.
 *
 * The one action available to a locked-out viewer is asking to be let in, and
 * a door with nobody named on it is one nobody knocks on. The mock makes the
 * same call -- its locked state keeps "Admins & mods" and drops the posts,
 * the roster, the event location and the counts.
 *
 * This is a real disclosure: it tells a stranger that these particular people
 * are in this particular private group. It is the narrowest version of that
 * which still leaves the page actionable, and it is the reason the API
 * returns leaders ungated.
 */
function GroupLeaders({ handle }: { handle: string }) {
  const { data, isLoading } = useGroupMembers(handle, {
    limit: ROSTER_CARD_SIZE,
  });

  if (isLoading) return null;

  const leaders = data?.leaders ?? [];
  if (leaders.length === 0) return null;

  return (
    <section className="border-pana-ink/10 rounded-2xl border bg-white p-5">
      <h2 className="text-pana-ink inline-flex items-center gap-1.5 text-[15px] font-extrabold">
        <Shield className="h-4 w-4" aria-hidden="true" />
        Admins and mods
      </h2>
      <p className="text-pana-ink/55 mt-1 text-[13px] font-medium">
        The people who can let you in.
      </p>
      <div className="mt-3 space-y-2">
        {leaders.map((leader) => (
          <MemberRow key={leader.id} member={leader} />
        ))}
      </div>
    </section>
  );
}

/**
 * What a stranger sees of a private group.
 *
 * Everything above this point still rendered -- name, summary, topics, member
 * count -- because a group nobody can identify is a group nobody can ask to
 * join. What stops here is the content.
 */
function LockedPanel({ isPending }: { isPending: boolean }) {
  return (
    <div className="border-pana-ink/15 flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
      <Lock className="text-pana-ink/35 h-7 w-7" aria-hidden="true" />
      <h2 className="text-pana-ink mt-3 text-[17px] font-extrabold">
        This group is private
      </h2>
      <p className="text-pana-ink/65 mt-1.5 max-w-sm text-[14px] leading-snug font-medium">
        {isPending
          ? 'Your request is with the organizers. You will see posts here once it is accepted.'
          : 'Posts, events and the member list are for members. You can still ask to join.'}
      </p>
    </div>
  );
}

/**
 * The primary action, which is a different button for each viewer.
 *
 *   - member   → Joined, which is a way out. A member needs no call to action.
 *   - pending  → Requested, which withdraws. Saying "Join" would re-ask.
 *   - invite   → nothing. An invite-only group cannot be asked.
 *   - request  → Request to join, which sets the expectation of a wait.
 *   - open     → Join group, one tap.
 *
 * Indigo rather than burnt, per the palette note in globals.css: white-on-burnt
 * measures about 4.2:1, under the 4.5 bar, while cream-on-indigo measures 9.01.
 */
function JoinAction({
  handle,
  group,
  viewer,
  stretch = false,
}: {
  handle: string;
  group: GroupDetailResponse['group'];
  viewer: GroupDetailResponse['viewer'];
  stretch?: boolean;
}) {
  const join = useJoinGroup();
  const leave = useLeaveGroup();
  const busy = join.isPending || leave.isPending;

  const stretchClass = stretch ? 'flex-1' : '';

  /* Null means signed out, which is not the same as "you may not join" -- so
     the button still shows and sign-in is the thing it asks for. */
  if (viewer.canJoin === null && !viewer.isMember && !viewer.isPending) {
    return (
      <Button
        asChild
        className={`bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full font-extrabold ${stretchClass}`}
      >
        <a href={`/signin?callbackUrl=${encodeURIComponent(`/g/${handle}`)}`}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Sign in to join
        </a>
      </Button>
    );
  }

  if (viewer.isMember || viewer.isPending) {
    return (
      <Button
        onClick={() => leave.mutate(handle)}
        disabled={busy}
        aria-pressed={true}
        variant="outline"
        className={`border-pana-ink/20 rounded-full font-extrabold ${stretchClass}`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : viewer.isPending ? (
          <Clock className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        {viewer.isPending ? 'Requested' : 'Joined'}
      </Button>
    );
  }

  // Invite-only: there is no action to offer, so none is shown.
  if (group.joinPolicy === 'invite') {
    return (
      <span className="text-pana-ink/55 text-[13px] font-bold">
        Invite only
      </span>
    );
  }

  const asks = group.joinPolicy === 'request';

  return (
    <Button
      onClick={() => join.mutate(handle)}
      disabled={busy}
      className={`bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full font-extrabold ${stretchClass}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : asks ? (
        <Lock className="h-4 w-4" aria-hidden="true" />
      ) : (
        <UserPlus className="h-4 w-4" aria-hidden="true" />
      )}
      {asks ? 'Request to join' : 'Join group'}
    </Button>
  );
}

function GroupSkeleton() {
  return (
    <main className="surface-cream min-h-screen pb-20" aria-hidden="true">
      <div className="bg-pana-ink/10 h-48 w-full animate-pulse" />
      <div className="container mx-auto max-w-4xl animate-pulse px-4 pt-8">
        <div className="bg-pana-ink/10 h-8 w-64 rounded-xl" />
        <div className="bg-pana-ink/10 mt-3 h-4 w-96 max-w-full rounded-lg" />
        <div className="bg-pana-ink/10 mt-6 h-24 rounded-2xl" />
      </div>
    </main>
  );
}
