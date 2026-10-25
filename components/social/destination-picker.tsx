'use client';

import { Check, ChevronDown, Globe, Lock, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PostVisibility } from '@/lib/utils/getVisibility';

/**
 * Where a post is going.
 *
 * Group destinations remain useful for pinned group-page wording, but the
 * personal composer only offers Everyone and Panas.
 */
export type Destination =
  | { kind: 'audience'; id: Exclude<PostVisibility, 'direct'> }
  | { kind: 'group'; id: string };

export const DEFAULT_DESTINATION: Destination = {
  kind: 'audience',
  id: 'public',
};

/**
 * The audiences a post can be addressed to.
 *
 * These are choices for new personal posts, not a relabelling of legacy
 * unlisted or followers-only statuses. The composer sends the additional
 * Panas audience flag when private sharing is selected.
 */
export const VISIBILITY_OPTIONS: {
  value: Exclude<PostVisibility, 'direct'>;
  icon: typeof Globe;
  label: string;
  description: string;
  reach: string;
  replyText: string;
}[] = [
  {
    value: 'public',
    icon: Globe,
    label: 'Everyone',
    description: 'A public post, on Pana Social and beyond',
    reach: 'Anyone can read this. It will appear in Everyone.',
    replyText: 'Reply to Everyone',
  },
  {
    value: 'private',
    icon: Users,
    label: 'Panas',
    description: 'People you follow who follow you back',
    reach: 'Only your mutual Panas can read this.',
    replyText: 'Reply',
  },
];

/**
 * The explicitly approved default for new personal posts.
 */
export const DEFAULT_VISIBILITY_OPTION = VISIBILITY_OPTIONS.find(
  (o) => o.value === 'public'
)!;

/**
 * The group fields this menu needs.
 *
 * Narrower than `MyGroupSummary` on purpose: the picker reads five fields, and
 * asking for the whole summary would couple a presentational control to a
 * query shape it does not use. `MyGroupSummary` satisfies this structurally,
 * so callers pass it unchanged.
 */
export interface DestinationGroup {
  id: string;
  handle: string;
  name: string;
  visibility: string;
  memberCount: number;
}

/**
 * Resolve the selected group, or `undefined` if it is not in the list.
 *
 * Returns rather than throws because the group list arrives asynchronously and
 * can change underneath a selection -- leaving a group in another tab is
 * enough. Presentational helpers use conservative fallback copy, while the
 * production composer treats a missing selected group as unresolved and
 * blocks submission. It must never turn a group-intended post into a personal
 * timeline post.
 */
export function findGroup(
  groups: DestinationGroup[],
  id: string
): DestinationGroup | undefined {
  return groups.find((g) => g.id === id);
}

/** The label on the closed chip. */
export function destinationLabel(
  destination: Destination,
  groups: DestinationGroup[]
): string {
  if (destination.kind === 'group') {
    return findGroup(groups, destination.id)?.name ?? 'Unavailable group';
  }
  return (
    VISIBILITY_OPTIONS.find((o) => o.value === destination.id)?.label ??
    'Choose audience'
  );
}

/**
 * The line under the composer that says who actually ends up seeing this.
 *
 * Derived from the destination because it is the only place the consequence of
 * the choice is stated in words. A picker that changes a chip label and
 * nothing else asks people to already know what "unlisted" means.
 *
 * A separate string from the menu hint on purpose: the hint is a noun phrase
 * answering "who is this?" while sitting next to a label, and this one is a
 * full sentence standing alone under a textarea. Reusing one for both reads as
 * a fragment in whichever place it was not written for.
 *
 * Note what it does *not* claim for groups: no fediverse reach. Group posts
 * are excluded from the federation outbox today via `personalStatusesOnly()`,
 * so promising otherwise here would be the composer lying about delivery.
 *
 * Not ported from the mock: a new-account variant reading "Posting to the
 * {county} timeline". It needs a county on the viewer, and there is no such
 * field -- `county` appears nowhere in `lib/` outside a comment about the
 * directory's own filter. Shipping it would mean inventing the data.
 */
export function reachLine(
  destination: Destination,
  groups: DestinationGroup[]
): string {
  if (destination.kind === 'group') {
    const group = findGroup(groups, destination.id);
    if (!group) return 'That group is no longer available to post to.';
    return group.visibility === 'private'
      ? `Only the ${group.memberCount} members of ${group.name} can see this`
      : `Posting to ${group.name} — ${group.memberCount} members, and anyone can read it`;
  }
  return (
    VISIBILITY_OPTIONS.find((o) => o.value === destination.id)?.reach ??
    'Choose who can see this before posting.'
  );
}

/**
 * The visibility to write a group post with.
 *
 * Always `unlisted`, regardless of what the audience section last had
 * selected. Inside a group the group's own visibility is what decides who may
 * read the post -- `visibleGroupStatuses` resolves readability from the group,
 * not the status -- so the status-level value only controls addressing. Public
 * addressing on a group post would claim a reach it does not have, since group
 * posts are held out of the federation outbox entirely.
 */
export const GROUP_POST_VISIBILITY = 'unlisted' as const;

/** One row. Icon, name, and the consequence in smaller type underneath. */
function Option({
  value,
  icon: Icon,
  label,
  hint,
  selected,
}: {
  value: string;
  icon: typeof Globe;
  label: string;
  hint: string;
  selected: boolean;
}) {
  return (
    <DropdownMenuRadioItem
      value={value}
      /* The primitive reserves `pl-8` for an indicator it draws on the left.
         This design puts the meaningful icon there instead and the check on
         the right, so the built-in indicator is hidden rather than worked
         around -- Radix still owns the role and aria-checked. */
      className="destination-option [&>span:first-child]:hidden"
    >
      <Icon className="destination-option-icon" aria-hidden="true" />
      <span className="min-w-0">
        <span className="destination-option-label">{label}</span>
        <span className="destination-option-hint">{hint}</span>
      </span>
      {selected && <Check className="destination-option-check" aria-hidden />}
    </DropdownMenuRadioItem>
  );
}

/** Personal audiences only. Group posting starts on the group's own page. */
export function DestinationPicker({
  destination,
  onChange,
  groups,
  open,
  onOpenChange,
  disabled,
  className = 'composer-chip',
}: {
  destination: Destination;
  onChange: (next: Destination) => void;
  groups: DestinationGroup[];
  isLoading?: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selectedGroup =
    destination.kind === 'group'
      ? findGroup(groups, destination.id)
      : undefined;

  const ChipIcon =
    destination.kind === 'group'
      ? selectedGroup?.visibility === 'private'
        ? Lock
        : Users
      : (VISIBILITY_OPTIONS.find((o) => o.value === destination.id)?.icon ??
        Users);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Audience: ${destinationLabel(destination, groups)}`}
          className={className}
        >
          <ChipIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {destinationLabel(destination, groups)}
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      {/* `collisionPadding` keeps the menu off the viewport edge on a phone,
          which is the bug that sent this to the primitive in the first
          place. */}
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="destination-menu"
      >
        <DropdownMenuRadioGroup
          value={destination.kind === 'audience' ? destination.id : ''}
          onValueChange={(value) => {
            if (value !== 'public' && value !== 'private') {
              throw new Error('Unknown post audience');
            }
            onChange({ kind: 'audience', id: value });
          }}
        >
          <DropdownMenuLabel className="destination-menu-heading">
            Who can see this?
          </DropdownMenuLabel>
          {VISIBILITY_OPTIONS.map((option) => (
            <Option
              key={option.value}
              value={option.value}
              icon={option.icon}
              label={option.label}
              hint={option.description}
              selected={
                destination.kind === 'audience' &&
                destination.id === option.value
              }
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
