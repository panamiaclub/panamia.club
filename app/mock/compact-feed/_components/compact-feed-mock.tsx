'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Bookmark,
  ChevronDown,
  Globe,
  Heart,
  MessageCircle,
  Plus,
  Share2,
  Sparkles,
  Users,
  Volume2,
} from 'lucide-react';
import { ComposerMock } from '../../composer/_components/composer-mock';
import { CompactSearchMock } from './compact-search-mock';
import {
  MOCK_POSTS,
  MOCK_VIEWER,
  type MockPost,
} from '../../feed/_data/mock-feed';

const SAMPLE_POSTS: MockPost[] = [
  {
    id: 'hello-panas',
    author: MOCK_VIEWER,
    body: 'A little hello to all the Panas finding their way here. A thought, a photo, a small moment from your day - it all belongs. Happy to have you here!',
    published: '25 minutes ago',
    repliesCount: 2,
    likesCount: 8,
    announcesCount: 0,
    fromPana: true,
    ccLicense: 'CC BY 4.0',
    topReply: {
      author: MOCK_POSTS[0].author,
      body: 'So happy to be here. More little everyday moments with the Panas, please!',
      published: '10 minutes ago',
    },
  },
  ...MOCK_POSTS.filter((post) =>
    ['post-2', 'post-8', 'post-6'].includes(post.id)
  ),
];

type MockComment = NonNullable<MockPost['topReply']>;

const COMMENT_PREVIEW_LIMIT = 2;

const EXTRA_COMMENTS: Record<string, MockComment[]> = {
  'hello-panas': [
    {
      author: MOCK_VIEWER,
      body: 'Exactly this. The small things are the good things.',
      published: '8 minutes ago',
    },
  ],
  'post-2': [
    {
      author: MOCK_POSTS[0].author,
      body: 'Please save me one! I will happily trade a cafecito.',
      published: '1 hour ago',
    },
    {
      author: MOCK_VIEWER,
      body: 'Done. A zine and coffee is a pretty good trade.',
      published: '50 minutes ago',
    },
    {
      author: MOCK_POSTS[2].author,
      body: 'The colours turned out so good. Bringing mine to the next print night.',
      published: '45 minutes ago',
    },
  ],
  'post-8': [
    {
      author: MOCK_VIEWER,
      body: 'Can I come if I have never used a Riso before?',
      published: '8 hours ago',
    },
    {
      author: MOCK_POSTS[4].author,
      body: 'Absolutely! First-timers are very welcome.',
      published: '7 hours ago',
    },
  ],
  'post-6': [
    {
      author: MOCK_POSTS[2].author,
      body: 'Thank you! This is exactly why I asked the Panas.',
      published: '22 hours ago',
    },
  ],
};

const FILTERS = [
  {
    id: 'everyone',
    label: 'Everyone',
    hint: 'Public posts from the community, newest first.',
  },
  {
    id: 'panas',
    label: 'Panas',
    hint: 'Your mutual Panas and your own posts. A little closer to home.',
  },
  {
    id: 'voice',
    label: 'Voice notes',
    hint: 'A little less typing, a little more you.',
  },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

export function CompactFeedMock() {
  const [filter, setFilter] = useState<Filter>('everyone');
  const active = FILTERS.find((entry) => entry.id === filter)!;
  const posts = SAMPLE_POSTS.filter((post) => {
    if (filter === 'voice') return false;
    if (filter === 'panas' && !post.fromPana) return false;
    return true;
  });

  return (
    <main id="compact-feed-study" className="surface-cream min-h-screen pb-12">
      <div className="mock-toolbar">
        <span className="mock-toolbar-badge">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Design mock
        </span>
        <span className="hidden sm:inline">
          People-first search + a quieter header
        </span>
        <Link
          href="/mock/composer"
          className="ml-auto inline-flex min-h-8 items-center gap-1.5"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Previous composer
        </Link>
        <span className="w-full opacity-80 sm:w-auto">
          Nothing here is published
        </span>
      </div>

      <header className="border-pana-ink/8 bg-pana-cream/95 sticky top-0 z-20 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
          <Image
            src="/logos/pana_social_long_orange.png"
            alt="Pana Social"
            width={190}
            height={52}
            className="h-6 w-auto min-w-0 object-contain"
          />
          <CompactSearchMock />
          <nav
            aria-label="Mock account navigation"
            className="ml-auto flex flex-none items-center gap-1.5"
          >
            <Link
              href="/mock/dm-chat"
              aria-label="Example messages"
              className="border-pana-ink/12 grid h-11 w-11 place-items-center rounded-full border hover:bg-white"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href="/mock/community-notifications"
              aria-label="Example notifications"
              className="border-pana-ink/12 hidden h-11 w-11 place-items-center rounded-full border hover:bg-white min-[380px]:grid"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href="/mock/profile"
              aria-label="Example profile"
              className="border-pana-ink/12 inline-flex min-h-11 items-center gap-2 rounded-full border p-1 pr-1 sm:pr-3"
            >
              <Image
                src={MOCK_VIEWER.avatar}
                alt=""
                width={34}
                height={34}
                className="h-8.5 w-8.5 rounded-full object-cover"
              />
              <span className="hidden text-xs font-extrabold md:inline">
                {MOCK_VIEWER.name.split(' ')[0]}
              </span>
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-7 px-4 pt-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0">
          <section
            aria-label="Stories preview"
            className="mb-4 flex min-h-12 items-center gap-3 px-1"
          >
            <div className="relative flex-none">
              <Image
                src={MOCK_VIEWER.avatar}
                alt=""
                width={42}
                height={42}
                className="border-pana-flame/30 h-10.5 w-10.5 rounded-full border-2 object-cover"
              />
              <span className="bg-pana-indigo text-pana-cream border-pana-cream absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full border-2">
                <Plus className="h-3 w-3" aria-hidden="true" />
              </span>
            </div>
            <div>
              <p className="text-xs font-extrabold">Your story</p>
              <p className="text-pana-ink/65 mt-0.5 text-xs">
                A little moment from your day.
              </p>
            </div>
            <span className="text-pana-ink/60 ml-auto hidden text-xs sm:inline">
              Here for 24 hours
            </span>
          </section>

          <ComposerMock compact />

          <div
            role="tablist"
            aria-label="Example feed"
            className="border-pana-ink/12 mt-5 flex flex-wrap gap-1 border-b pb-2"
          >
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={`compact-tab-${entry.id}`}
                aria-controls="compact-feed-posts"
                aria-selected={filter === entry.id}
                onClick={() => setFilter(entry.id)}
                className={`focus-visible:ring-pana-indigo inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold transition-colors focus-visible:ring-2 sm:px-4 sm:text-sm ${filter === entry.id ? 'bg-pana-indigo/8 text-pana-indigo' : 'text-pana-ink/65 hover:bg-white/70'}`}
              >
                {entry.id === 'everyone' && (
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {entry.id === 'panas' && (
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {entry.id === 'voice' && (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {entry.label}
              </button>
            ))}
          </div>
          <p className="text-pana-ink/65 my-3 px-1 text-xs leading-relaxed">
            {active.hint}
          </p>

          <section
            id="compact-feed-posts"
            role="tabpanel"
            aria-labelledby={`compact-tab-${filter}`}
            className="space-y-4"
          >
            {posts.map((post) => (
              <WarmPostCard key={post.id} post={post} />
            ))}
            {!posts.length && (
              <div className="border-pana-ink/10 rounded-3xl border bg-white/70 p-6 text-sm">
                <p className="font-extrabold">
                  {filter === 'voice'
                    ? 'No voice notes in this sample.'
                    : 'No example posts in this feed yet.'}
                </p>
                <p className="text-pana-ink/65 mt-1 leading-relaxed">
                  {filter === 'voice'
                    ? 'Try the Audio button above to preview a file from your device.'
                    : 'Switch to Everyone to see the sample community posts.'}
                </p>
              </div>
            )}
          </section>
          <p className="text-pana-ink/60 mt-7 text-center text-xs">
            A few example posts. A little more room for your community.
          </p>
        </div>

        <aside aria-label="Community sidebar" className="space-y-4">
          <section className="border-pana-flame/20 overflow-hidden rounded-3xl border bg-white/85">
            <div className="from-pana-flame/12 to-pana-cream/60 flex items-center gap-3 bg-linear-to-br p-5">
              <Image
                src={MOCK_VIEWER.avatar}
                alt=""
                width={44}
                height={44}
                className="border-pana-flame/20 h-11 w-11 rounded-full border-2 object-cover"
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold">{MOCK_VIEWER.name}</p>
                <p className="text-pana-ink/65 mt-0.5 truncate text-xs">
                  @{MOCK_VIEWER.handle}
                </p>
              </div>
            </div>
            <div className="border-pana-flame/10 grid grid-cols-3 border-t px-3 py-4 text-center">
              {[
                [MOCK_VIEWER.panas.toLocaleString(), 'Panas'],
                [String(MOCK_VIEWER.groups), 'Groups'],
                [
                  String(
                    SAMPLE_POSTS.filter(
                      (post) => post.author.handle === MOCK_VIEWER.handle
                    ).length
                  ),
                  'Posts',
                ],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="text-pana-indigo text-lg font-black">{value}</p>
                  <p className="text-pana-ink/65 mt-0.5 text-[11px] font-bold">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-pana-burnt/15 bg-pana-butter-2/65 rounded-3xl border p-5">
            <p className="text-pana-burnt-deep flex items-center gap-1.5 text-[10px] font-extrabold tracking-widest uppercase">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Growing with the Panas
            </p>
            <h2 className="mt-2 text-base font-extrabold">
              Good things ahead.
            </h2>
            <p className="text-pana-ink/70 mt-2 text-[13px] leading-relaxed">
              More ways to keep the good stuff and spend time together.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="border-pana-burnt/10 inline-flex items-center gap-1 rounded-full border bg-white/70 px-2.5 py-1.5">
                <Bookmark className="h-3 w-3" aria-hidden="true" />
                Saved posts
              </span>
              <span className="border-pana-burnt/10 rounded-full border bg-white/70 px-2.5 py-1.5">
                Jams
              </span>
              <span className="border-pana-burnt/10 rounded-full border bg-white/70 px-2.5 py-1.5">
                Trending
              </span>
            </div>
            <p className="text-pana-ink/65 mt-3 text-[11px] font-semibold">
              Coming soon. Not extra things to scroll past.
            </p>
          </section>

          <p className="text-pana-ink/65 px-2 text-xs leading-relaxed">
            Part of Pana Mia Club. Same Panas, a little more connected.
            <Link
              href="/mock/directory"
              className="text-pana-indigo mt-2 flex min-h-8 w-fit items-center gap-1 font-extrabold"
            >
              Explore the directory
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </aside>
      </div>
    </main>
  );
}

function WarmPostCard({ post }: { post: MockPost }) {
  const [liked, setLiked] = useState(Boolean(post.liked));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState(false);
  const commentsId = useId();
  const likes = post.likesCount - (post.liked ? 1 : 0) + (liked ? 1 : 0);
  const comments = [
    ...(post.topReply ? [post.topReply] : []),
    ...(EXTRA_COMMENTS[post.id] ?? []),
  ];
  const hasMoreComments = comments.length > COMMENT_PREVIEW_LIMIT;

  return (
    <article
      aria-label={`Example post by ${post.author.name}`}
      className="border-pana-flame/20 shadow-pana-burnt/5 overflow-hidden rounded-3xl border bg-white shadow-sm"
    >
      <header className="border-pana-flame/10 from-pana-flame/12 via-pana-cream/75 flex items-start gap-3 border-b bg-linear-to-r to-white px-4 py-3.5 sm:px-5">
        <Image
          src={post.author.avatar}
          alt=""
          width={40}
          height={40}
          className="border-pana-flame/20 h-10 w-10 flex-none rounded-full border-2 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">{post.author.name}</p>
          <p className="text-pana-ink/65 mt-0.5 text-xs break-words">
            @{post.author.handle}
            <span className="mx-1.5" aria-hidden="true">
              &middot;
            </span>
            <time>{post.published}</time>
          </p>
        </div>
        <span
          title="Public post"
          className="text-pana-indigo mt-0.5 inline-flex flex-none items-center gap-1 rounded-full bg-white/75 px-2 py-1 text-[10px] font-extrabold"
        >
          <Globe className="h-3 w-3" aria-hidden="true" />
          Everyone
        </span>
      </header>

      <div className="p-4 sm:px-5">
        <p className="text-pana-ink/90 text-[15px] leading-7 break-words">
          {post.body}
        </p>
        {post.attachments?.map((attachment) => (
          <Image
            key={attachment.src}
            src={attachment.src}
            alt={attachment.alt}
            width={900}
            height={540}
            className="mt-4 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        ))}
      </div>

      <footer className="border-pana-indigo/7 bg-pana-indigo/4 flex flex-wrap items-center gap-x-2 border-t px-3 py-1.5 sm:px-4">
        <button
          type="button"
          aria-label={`Like example post by ${post.author.name}`}
          aria-pressed={liked}
          onClick={() => setLiked(!liked)}
          className={`focus-visible:ring-pana-indigo inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-extrabold focus-visible:ring-2 ${liked ? 'text-pana-red-deep bg-pana-red/7' : 'text-pana-indigo hover:bg-pana-indigo/7'}`}
        >
          <Heart
            className={`h-4 w-4 ${liked ? 'fill-current' : ''}`}
            aria-hidden="true"
          />
          {likes}
        </button>
        {hasMoreComments ? (
          <button
            type="button"
            aria-label={
              commentsOpen
                ? 'Show fewer example comments'
                : `Show all ${comments.length} example comments`
            }
            aria-expanded={commentsOpen}
            aria-controls={commentsId}
            onClick={() => setCommentsOpen(!commentsOpen)}
            className="text-pana-indigo hover:bg-pana-indigo/7 focus-visible:ring-pana-indigo inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-extrabold focus-visible:ring-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {comments.length}
          </button>
        ) : (
          <span className="text-pana-indigo inline-flex min-h-11 items-center gap-2 px-2 text-xs font-extrabold">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {comments.length}
            <span className="sr-only"> comments, all visible</span>
          </span>
        )}
        <button
          type="button"
          aria-label="Share example post"
          onClick={() => setShareNotice(true)}
          className="text-pana-indigo hover:bg-pana-indigo/7 focus-visible:ring-pana-indigo grid h-11 w-11 place-items-center rounded-xl focus-visible:ring-2"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
        </button>
        {post.ccLicense && (
          <span className="text-pana-ink/60 ml-auto text-[10px] font-semibold">
            {post.ccLicense}
          </span>
        )}
      </footer>
      {shareNotice && (
        <p role="status" className="text-pana-indigo px-5 py-3 text-xs">
          This is an example post. No real post link was copied.
        </p>
      )}
      {comments.length > 0 && (
        <section
          id={commentsId}
          aria-label="Example comments"
          className="border-pana-indigo/8 bg-pana-indigo/3 border-t px-4 py-3 sm:px-5"
        >
          <ul className="space-y-2.5">
            {comments
              .slice(0, commentsOpen ? comments.length : COMMENT_PREVIEW_LIMIT)
              .map((comment) => (
                <MockCommentRow
                  key={`${comment.author.handle}-${comment.published}`}
                  comment={comment}
                />
              ))}
          </ul>
          {hasMoreComments && (
            <button
              type="button"
              aria-expanded={commentsOpen}
              aria-controls={commentsId}
              onClick={() => setCommentsOpen(!commentsOpen)}
              className="text-pana-indigo focus-visible:ring-pana-indigo mt-1 ml-10 inline-flex min-h-11 items-center gap-1 rounded-lg text-xs font-extrabold focus-visible:ring-2"
            >
              {commentsOpen
                ? 'Show fewer comments'
                : `View all ${comments.length} comments`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${commentsOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </section>
      )}
    </article>
  );
}

function MockCommentRow({ comment }: { comment: MockComment }) {
  return (
    <li className="flex min-w-0 items-start gap-2.5">
      <Image
        src={comment.author.avatar}
        alt=""
        width={30}
        height={30}
        className="mt-0.5 h-7.5 w-7.5 flex-none rounded-full object-cover"
      />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-white/85 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-extrabold">{comment.author.name}</span>
          <time className="text-pana-ink/60 text-[10px] font-semibold">
            {comment.published}
          </time>
        </div>
        <p className="text-pana-ink/80 mt-1 text-[13px] leading-relaxed break-words">
          {comment.body}
        </p>
      </div>
    </li>
  );
}
