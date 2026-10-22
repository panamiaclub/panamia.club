'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CalendarDays, ImagePlus, Link2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MOCK_MEMBERS,
  type MockGroup,
  type ViewerState,
} from '../_data/mock-group';

export function GroupComposer({
  group,
  viewer,
}: {
  group: MockGroup;
  viewer: ViewerState;
}) {
  const [body, setBody] = useState('');
  const [posted, setPosted] = useState(false);
  const author = viewer === 'moderator' ? MOCK_MEMBERS[1] : MOCK_MEMBERS[0];
  const canCreateEvent = viewer === 'admin' || viewer === 'moderator';

  const submitPost = () => {
    if (!body.trim()) return;
    setBody('');
    setPosted(true);
  };

  return (
    <section className="feed-composer mb-4" aria-label="Create a group post">
      <div className="flex items-start gap-3">
        <div className="border-pana-ink/10 relative h-10 w-10 flex-none overflow-hidden rounded-full border-2">
          <Image
            src={author.avatar}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="group-composer-input" className="sr-only">
            Create a post in {group.name}
          </label>
          <textarea
            id="group-composer-input"
            rows={2}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setPosted(false);
            }}
            className="feed-composer-prompt"
            placeholder={`Create a post in ${group.name}`}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-13">
        <button type="button" className="composer-chip">
          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
          Photo
        </button>
        <button type="button" className="composer-chip">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Link
        </button>
        <button type="button" className="composer-chip">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          Poll
        </button>
        {canCreateEvent ? (
          <button type="button" className="composer-chip">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Event
          </button>
        ) : null}

        <Button
          size="sm"
          className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 ml-auto rounded-full px-5 font-extrabold"
          disabled={!body.trim()}
          onClick={submitPost}
        >
          Post
        </Button>
      </div>

      <p className="text-pana-ink/50 mt-2.5 text-[12px] font-bold sm:pl-13">
        Posting as @{author.handle} · visible to {group.name}
      </p>

      {posted ? (
        <p
          className="text-pana-indigo mt-2 text-[12px] font-extrabold sm:pl-13"
          role="status"
        >
          Posted to the group. This mock does not save changes.
        </p>
      ) : null}
    </section>
  );
}
