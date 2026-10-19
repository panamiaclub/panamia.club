'use client';

import { Check, ChevronDown, Globe, Lock, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PostVisibility } from '@/lib/utils/getVisibility';

/**
 * Where a post is going.
 *
 * Two shapes rather than one flat enum, because these are not two values of
 * the same setting. An audience sets the visibility of a post that still
 * belongs to the author's own timeline. A group changes the destination of the
 * write entirely -- a different endpoint, membership re-checked server-side,
 * and the *group's* visibility is what then governs who may read it.
 * Flattening them into one list of strings is how a caller ends up sending a
 * group id where a visibility was expected.
 */
export type Destination =
  | { kind: 'audience'; id: Exclude<PostVisibility, 'direct'> }
  | { kind: 'group'; id: string };

export const DEFAULT_DESTINATION: Destination = {
  kind: 'audience',
  id: 'unlisted',
};

/**
 * The audiences a post can be addressed to.
 *
 * Wording follows the approved feed mock: nouns people recognise ("Everyone",
 * "Local Panas", "Your Panas") rather than protocol words ("public",
 * "unlisted", "followers"). "Unlisted" in particular names a Mastodon
 * addressing mode, not an audience, and nobody outside the fediverse reads it
 * as "the people near me".
 *
 * Lives here rather than in the composer because this menu is the only place
 * they are presented, and a second copy of this list is a second place for the
 * wording to drift. The composer still imports it for the reply button, which
 * names the audience without offering the choice.
 *
 * Ordered widest to narrowest, as in the mock. Nothing may index this array
 * positionally -- see `DEFAULT_VISIBILITY_OPTION`.
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
    description: 'Any Pana, plus the wider fediverse',
    reach: 'Anyone on Pana Mia, and servers across the fediverse',
    replyText: 'Reply to Everyone',
  },
  {
    value: 'unlisted',
    icon: Users,
    label: 'Local Panas',
    description: 'Anyone in Miami-Dade and Broward',
    reach: 'Anyone in Miami-Dade and Broward can see this',
    replyText: 'Reply to Local Panas',
  },
  {
    value: 'private',
    icon: Lock,
    label: 'Your Panas',
    description: 'Only the Panas who follow you',
    reach: 'Only the Panas who follow you can see this',
    replyText: 'Reply to Your Panas',
  },
];

/**
 * The option to fall back to when a visibility cannot be resolved.
 *
 * Named rather than `VISIBILITY_OPTIONS[0]`, because the array is ordered for
 * the menu (widest first) and index 0 is therefore the *most* public option.
 * A positional fallback here silently widens reach the moment someone reorders
 * the list for design reasons -- it is a one-line edit with no visible
 * connection to this behaviour. Falling back to the narrower local audience is
 * the safe direction, and it matches `DEFAULT_DESTINATION`.
 */
export const DEFAULT_VISIBILITY_OPTION =
  VISIBILITY_OPTIONS.find((o) => o.value === 'unlisted') ??
  VISIBILITY_OPTIONS[0];

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
    return findGroup(groups, destination.id)?.name ?? 'Local Panas';
  }
  return (
    VISIBILITY_OPTIONS.find((o) => o.value === destination.id)?.label ??
    'Local Panas'
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
    if (!group) return DEFAULT_VISIBILITY_OPTION.reach;
    return group.visibility === 'private'
      ? `Only the ${group.memberCount} members of ${group.name} can see this`
      : `Posting to ${group.name} — ${group.memberCount} members, and anyone can read it`;
  }
  return (
    VISIBILITY_OPTIONS.find((o) => o.value === destination.id)?.reach ??
    DEFAULT_VISIBILITY_OPTION.reach
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

/**
 * Radix's radio group addresses items by a single string, so the discriminated
 * union is encoded on the way in and decoded on the way out.
 *
 * This is a transport detail of the menu widget and deliberately does not
 * escape it -- everything outside this file still sees the two-shape
 * `Destination`. The prefix is what keeps a group id from being mistaken for a
 * visibility once they share one list. Decoding splits on the first colon only,
 * so an id containing one survives the round trip.
 */
function encode(destination: Destination): string {
  return `${destination.kind}:${destination.id}`;
}

function decode(value: string): Destination {
  const separator = value.indexOf(':');
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return kind === 'group'
    ? { kind: 'group', id }
    : { kind: 'audience', id: id as Exclude<PostVisibility, 'direct'> };
}

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

/**
 * One control for "where does this go", with audiences and groups as separate
 * sections of the same menu.
 *
 * The alternative considered was two controls -- an audience picker plus a
 * group picker. It models the data more literally, but it puts two dropdowns
 * in a row that already carries media, CW, Preview, licence and Post, and it
 * asks every poster to answer a second question that only matters to the
 * minority of posts that go to a group.
 *
 * Sectioning solves it because choosing a group genuinely *is* an answer to
 * the audience question: a private group's post is member-only no matter what
 * visibility the status carries. One question, asked once.
 *
 * Built on the existing Radix dropdown rather than a hand-rolled popover. The
 * first version of this was hand-rolled and overflowed the left edge of a
 * 390px viewport by 17px, clipping the icons -- collision handling, focus
 * return, arrow-key navigation and dismissal are all things the primitive
 * already does correctly and a bespoke menu has to re-earn.
 */
export function DestinationPicker({
  destination,
  onChange,
  groups,
  isLoading,
  open,
  onOpenChange,
}: {
  destination: Destination;
  onChange: (next: Destination) => void;
  groups: DestinationGroup[];
  isLoading?: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
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
        {/* Not disabled alongside the Post button: picking who a post is for
            is a decision people make before typing. */}
        <button type="button" className="composer-chip">
          <ChipIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {destinationLabel(destination, groups)}
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      {/* `collisionPadding` keeps the menu off the viewport edge on a phone,
          which is the bug that sent this to the primitive in the first
          place. */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="destination-menu"
      >
        <DropdownMenuRadioGroup
          value={encode(destination)}
          onValueChange={(value) => onChange(decode(value))}
        >
          <DropdownMenuLabel className="destination-menu-heading">
            Your timeline
          </DropdownMenuLabel>
          {VISIBILITY_OPTIONS.map((option) => (
            <Option
              key={option.value}
              value={`audience:${option.value}`}
              icon={option.icon}
              label={option.label}
              hint={option.description}
              selected={
                destination.kind === 'audience' &&
                destination.id === option.value
              }
            />
          ))}

          <DropdownMenuSeparator className="destination-menu-separator" />

          <DropdownMenuLabel className="destination-menu-heading">
            Your groups
          </DropdownMenuLabel>

          {/* The empty state is a real case, not a footnote: most accounts
              join nothing for a while, and a section header above an empty
              void reads as a bug. Loading is called out separately so an
              in-flight request is never mistaken for "you have no groups". */}
          {isLoading ? (
            <p className="destination-menu-empty">Loading your groups...</p>
          ) : groups.length === 0 ? (
            <p className="destination-menu-empty">
              You have not joined any groups yet. Posts to a group reach its
              members whether or not they follow you.
            </p>
          ) : (
            groups.map((group) => (
              <Option
                key={group.id}
                value={`group:${group.id}`}
                icon={group.visibility === 'private' ? Lock : Users}
                label={group.name}
                hint={
                  group.visibility === 'private'
                    ? `Private — ${group.memberCount} members`
                    : `Public — ${group.memberCount} members`
                }
                selected={
                  destination.kind === 'group' && destination.id === group.id
                }
              />
            ))
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
