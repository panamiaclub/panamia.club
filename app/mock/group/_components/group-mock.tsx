'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Clock, Lock, Shield, Sparkles } from 'lucide-react';
import type { MockSurface } from '../../_data/panaverse';
import { SurfaceMasthead } from '../../_components/surface-masthead';
import { FeedPostCard } from '../../feed/_components/feed-post-card';
import {
  canManage,
  isInsider,
  MOCK_EVENTS,
  MOCK_GROUP,
  MOCK_GROUP_POSTS,
  MOCK_MEMBERS,
  MOCK_PENDING,
  MOCK_PRIVATE_GROUP,
  MOCK_RELATED,
  type GroupTab,
  type ViewerState,
} from '../_data/mock-group';
import { GroupHero } from './group-hero';
import { GroupRail } from './group-rail';
import { GroupManage } from './group-manage';
import { EventCard, MemberRow } from './group-panels';
import { GroupComposer } from './group-composer';

/* Design mock for a Pana Social group home page.
 *
 * Deliberately built out of the feed and profile mocks rather than beside
 * them. The post cards are literally imported from /mock/feed — not copied,
 * imported — because the design claim being made is that a group post IS a
 * status with a group_id on it, exactly as docs/GROUPS-ROADMAP.md proposes. If
 * a group post needed its own card, the schema would be wrong. Reusing the
 * component is how the mock argues the schema is right.
 *
 * The hero is the profile's hero with a privacy state and a join action, for
 * the same reason: a group is an actor, so it wears an actor's furniture.
 *
 * The toolbar switches viewer state rather than content state, which is the
 * one real departure from the feed mock. A group looks materially different
 * depending on who is asking, and that difference is the whole design problem.
 * `locked` is the important one. */
export function GroupMock({ surfaces }: { surfaces: MockSurface[] }) {
  const router = useRouter();
  const [viewer, setViewer] = useState<ViewerState>('member');
  const [activeTab, setActiveTab] = useState<GroupTab>('posts');
  const [joined, setJoined] = useState(true);

  const group = viewer === 'locked' ? MOCK_PRIVATE_GROUP : MOCK_GROUP;
  const isMember = isInsider(viewer) || joined;

  const current =
    surfaces.find((surface) => surface.id === 'social') ?? surfaces[0];

  /* Three tabs, the same three for everyone who can see the group at all.
     Real-time chat is deliberately not one of them — it is being designed as
     its own feature on its own surface, so this page stays a slow surface:
     posts, events, roster.

     Manage is the exception, and it is an exception on purpose: it appears
     only for admins and moderators, and it carries a count. Every other tab
     counts what it contains; this one counts what is waiting on you, which is
     the only number on this page with a person attached to the other end of
     it. That is the whole argument for the tab — the approval queue already
     works, it is just unreachable from a group small enough not to paginate
     its roster. */
  const tabs: { id: GroupTab; label: string; count: number }[] = [
    { id: 'posts', label: 'Posts', count: MOCK_GROUP_POSTS.length },
    { id: 'events', label: 'Events', count: MOCK_EVENTS.length },
    { id: 'members', label: 'Members', count: MOCK_MEMBERS.length },
    ...(canManage(viewer)
      ? [
          {
            id: 'manage' as const,
            label: 'Manage',
            count: MOCK_PENDING.length,
          },
        ]
      : []),
  ];

  const selectViewer = (next: ViewerState) => {
    setViewer(next);
    setJoined(isInsider(next));
    /* Landing an admin on Manage would flatter the design by hiding the thing
       it is fixing: that nothing on the group page tells you the queue is
       there. Everyone starts on Posts and has to notice the badge. */
    setActiveTab('posts');
  };

  return (
    <main className="surface-cream min-h-screen pb-20">
      <MockToolbar
        viewer={viewer}
        onSelectViewer={selectViewer}
        hostname={current.hostname}
      />

      <SurfaceMasthead
        surfaces={surfaces}
        current={current}
        onSelect={(id) => {
          if (id !== current.id) router.push('/mock/panaverse');
        }}
        sticky
        contained
      />

      <GroupHero
        group={group}
        viewer={viewer}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        joined={joined}
        onToggleJoin={() => setJoined((value) => !value)}
      />

      <div className="container mx-auto max-w-6xl px-4 pt-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div className="min-w-0">
            {viewer === 'locked' ? (
              <LockedPanel />
            ) : (
              <>
                {/* The tab badge is a label; this is the alert.
                    On a 430px phone four uppercase letter-spaced tabs measure
                    504px in a 383px strip, so "Manage 3" sits off the right
                    edge with nothing to suggest it is there — the strip
                    scrolls but hides its scrollbar. An organiser on a phone
                    would therefore never learn anyone is waiting, which is the
                    same failure this tab was built to fix.

                    So the count also gets a row that cannot be scrolled out of
                    view. It is not a second copy of the queue: it appears only
                    when someone is actually waiting, and only while you are
                    somewhere else. Open Manage and it goes away. */}
                {canManage(viewer) &&
                  MOCK_PENDING.length > 0 &&
                  activeTab !== 'manage' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('manage')}
                      className="border-pana-burnt/30 bg-pana-burnt/8 mb-3 flex w-full items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left"
                    >
                      <Clock
                        className="text-pana-burnt h-4 w-4 flex-none"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 text-[13px] leading-snug font-bold">
                        <span className="font-black">
                          {MOCK_PENDING.length} waiting to join
                        </span>
                        <span className="text-pana-ink/60">
                          {' '}
                          · longest {MOCK_PENDING[0].waiting}
                        </span>
                      </span>
                      <span className="text-pana-burnt flex-none text-[12.5px] font-black">
                        Review
                      </span>
                    </button>
                  )}

                <div role="tablist" aria-label="Group sections">
                  <div className="profile-tabs">
                    {tabs.map((tab) => {
                      const isActive = tab.id === activeTab;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          id={`group-tab-${tab.id}`}
                          aria-selected={isActive}
                          aria-controls="group-panel"
                          className="profile-tab"
                          data-active={isActive}
                          onClick={() => setActiveTab(tab.id)}
                        >
                          {tab.label}
                          <span
                            className={
                              tab.id === 'manage'
                                ? 'profile-tab-count bg-pana-burnt/15 text-pana-burnt'
                                : 'profile-tab-count'
                            }
                          >
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  id="group-panel"
                  role="tabpanel"
                  aria-labelledby={`group-tab-${activeTab}`}
                  className="mt-5"
                >
                  {activeTab === 'posts' && (
                    <div className="space-y-4">
                      {isMember ? (
                        <GroupComposer group={group} viewer={viewer} />
                      ) : null}

                      {/* Non-members read but cannot post. The roadmap's
                          write path checks membership; saying so here keeps
                          the mock honest about it. */}
                      {!isMember && (
                        <p className="text-pana-ink/60 border-pana-ink/10 rounded-2xl border border-dashed px-4 py-3 text-[13px] leading-snug font-bold">
                          You&apos;re reading a public group. Join to post or
                          reply.
                        </p>
                      )}
                      {MOCK_GROUP_POSTS.map((post) => (
                        <FeedPostCard
                          key={post.id}
                          post={post}
                          showGroupContext={false}
                        />
                      ))}
                      <div className="feed-end mt-8">
                        <span>That&apos;s the whole group so far</span>
                      </div>
                    </div>
                  )}

                  {activeTab === 'events' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {MOCK_EVENTS.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </div>
                  )}

                  {activeTab === 'members' && (
                    <div className="space-y-3">
                      {MOCK_MEMBERS.map((member) => (
                        <MemberRow key={member.id} member={member} />
                      ))}
                    </div>
                  )}

                  {/* Guarded a second time rather than trusting that the tab
                      is absent. A tab you cannot see is not an access
                      control. */}
                  {activeTab === 'manage' && canManage(viewer) && (
                    <GroupManage viewer={viewer} />
                  )}
                </div>
              </>
            )}
          </div>

          <GroupRail
            group={group}
            members={
              viewer === 'locked' ? MOCK_MEMBERS.slice(0, 2) : MOCK_MEMBERS
            }
            /* Scoped to the group actually being rendered rather than passed
               unconditionally. The private fixture hosts nothing, and an
               earlier revision of this file leaked the public group's next
               workshop into its rail — a real instance of the bug the locked
               state exists to catch, caught by the locked state. */
            nextEvent={group.eventCount > 0 ? MOCK_EVENTS[0] : undefined}
            related={viewer === 'locked' ? [] : MOCK_RELATED}
            viewer={viewer}
          />
        </div>

        <p className="border-pana-ink/10 text-pana-ink/55 mt-14 border-t pt-6 text-[13px] font-bold">
          Design mock at <code>/mock/group</code> with hardcoded data, following{' '}
          <code>docs/GROUPS-ROADMAP.md</code>. Post cards are imported from{' '}
          <Link href="/mock/feed" className="link-arrow text-pana-indigo">
            /mock/feed
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>{' '}
          rather than redrawn, because a group post is a status with a group on
          it. The hero shares its primitives with{' '}
          <Link href="/mock/profile" className="link-arrow text-pana-indigo">
            /mock/profile
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </main>
  );
}

/* What a non-member sees of a private group.
 *
 * This panel is the most important thing on the page. The roadmap lists
 * private-group leakage as the highest-severity risk in the whole design —
 * one missing membership check in the timeline query and a tenant union's
 * posts land in a stranger's feed. A risk written in a document is easy to
 * nod at; a risk drawn on screen is something a reviewer can actually check.
 *
 * So the rule is visible rather than described: no posts, no roster, no event
 * location, no post or event counts. Name, summary, admins, member
 * count, and a way in. If a future change causes anything else to appear here,
 * the mock has caught a bug. */
function LockedPanel() {
  return (
    <div className="space-y-4">
      <div className="reserved-slot items-start p-7">
        <p className="reserved-slot-title inline-flex items-center gap-2">
          <Lock className="h-4 w-4" aria-hidden="true" />
          This group is private
        </p>
        <p className="text-pana-ink/70 max-w-prose text-[14px] leading-relaxed font-medium">
          Posts, members, and events are only visible to people who have been
          approved. An admin reviews every request.
        </p>
        <p className="text-pana-ink/50 max-w-prose text-[13px] leading-snug font-medium">
          Nothing from inside this group is loaded on this page — not in the
          feed, not in search, not here.
        </p>
      </div>

      <div className="profile-card flex items-start gap-3 p-5">
        <Shield
          className="text-pana-indigo mt-0.5 h-5 w-5 flex-none"
          aria-hidden="true"
        />
        <div>
          <p className="text-[14px] leading-snug font-extrabold">
            Why groups can be private
          </p>
          <p className="text-pana-ink/65 mt-1 max-w-prose text-[13px] leading-relaxed font-medium">
            Tenant unions, mutual aid crews, and support circles organise here
            too. A group that cannot be read from the outside is the reason they
            can.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Developer chrome, same treatment as the feed mock: dark, above the masthead,
   scrolls away while the masthead sticks. The switch changes who is looking
   rather than what exists, because a group's design problem is a permissions
   problem. */
function MockToolbar({
  viewer,
  onSelectViewer,
  hostname,
}: {
  viewer: ViewerState;
  onSelectViewer: (viewer: ViewerState) => void;
  hostname: string;
}) {
  return (
    <div className="mock-toolbar">
      <span className="mock-toolbar-badge">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Mock
      </span>

      <span className="mock-toolbar-host">
        <Lock className="h-3 w-3 flex-none" aria-hidden="true" />
        {hostname}
      </span>

      <div className="mock-switch ml-auto">
        <button
          type="button"
          data-active={viewer === 'admin'}
          onClick={() => onSelectViewer('admin')}
        >
          Admin
        </button>
        <button
          type="button"
          data-active={viewer === 'moderator'}
          onClick={() => onSelectViewer('moderator')}
        >
          Moderator
        </button>
        <button
          type="button"
          data-active={viewer === 'member'}
          onClick={() => onSelectViewer('member')}
        >
          Member
        </button>
        <button
          type="button"
          data-active={viewer === 'visitor'}
          onClick={() => onSelectViewer('visitor')}
        >
          Visitor
        </button>
        <button
          type="button"
          data-active={viewer === 'locked'}
          onClick={() => onSelectViewer('locked')}
        >
          Private
        </button>
      </div>

      <Link href="/mock/feed" className="mock-toolbar-link">
        Feed mock
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
