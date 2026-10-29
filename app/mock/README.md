# Design Mocks (`/mock/*`)

Fixture-backed design mocks used to agree on a surface before it is built
against real data. Nothing here queries the database, and every route is
`noindex` so the mocks never reach search results.

These are not prototypes to be shipped as-is. They are the argument for a
design, written in the real design system so the argument is honest: if a
layout only works with invented spacing or colours that are not in
`app/globals.css`, that shows up here rather than in review.

| Route                     | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `/mock/home`              | Homepage cut to four cards, built from the Connectors deck                        |
| `/mock/profile`           | Personal profile page (pana page) redesign                                        |
| `/mock/profile-next`      | Pana page, second pass: identity rail left, tabbed content right                  |
| `/mock/feed`              | Pana Social feed redesign, including the empty feed                               |
| `/mock/app`               | Mobile app navigation: Directory, Social, Community, and Profile                  |
| `/mock/composer`          | Friendly social card: inline local media, Everyone/Panas audience                 |
| `/mock/panaverse`         | Panaverse chrome: masthead, surface switcher, identity                            |
| `/mock/settings`          | Account settings — one page, either masthead                                      |
| `/mock/directory`         | Directory search results, pre-map                                                 |
| `/mock/directory-unified` | One directory theme across businesses, panas, groups and events                   |
| `/mock/explore`           | Scope moved into the search bar; directory narrowed to businesses                 |
| `/mock/groups`            | Groups landing and discover, as two steps of one flow                             |
| `/mock/dms`               | Direct messages, as two competing models behind one switch                        |
| `/mock/dm-chat`           | Interactive Messages workspace: desktop panes, mobile list/chat, drafts and retry |
| `/mock/events`            | Events discovery: lanes that say why, not facets to narrow with                   |
| `/mock/events/host`       | Host an event: the form, answering to the page it feeds                           |

## Viewing the Pana Social surface

`/mock/feed` mocks a page of `social.panamia.club`, not a page of
`panamia.club`. The root layout picks its chrome from the request hostname via
`resolveSurface`, so the hostname you use decides what you see:

```
http://localhost:3002/mock/feed          → Pana Mia masthead wraps the mock
http://social.localhost:3002/mock/feed   → Pana Social, standalone
```

Use the second one when reviewing the feed. Browsers route `*.localhost` to
the loopback address with no hosts-file entry, and `resolveSurface` maps
`social.localhost` exactly the way it maps `social.panamia.club`, so this
exercises the real production rule rather than a preview-only shortcut.

`/mock/composer` uses the same Pana Social hostname. Its photo/video and audio
pickers, file drop target, and image paste handling create browser-local previews
only. No files are uploaded and no posts are published. Removing an attachment
or leaving the page releases its local preview; the sample-photo button needs
no personal files.

`/mock/dm-chat` supplies its own masthead on every hostname so the workspace
can occupy the viewport. The conversation list and transcript scroll
independently on desktop; narrow screens show one or the other with a Back
button. New message opens a sample-person picker. Text and sample-animation
drafts stay with their conversation until the page is reloaded or reset.

The real `/messages` page now shares `components/messages/workspace.module.css`
and `MessageAvatar` with this mock, including the warmer canvas and touch-friendly
controls. Only the presentation is shared: the real page uses its
authenticated message APIs and DM socket, while this mock stays fixture-only.

Use **Receive message** while reading older messages to try the jump-to-latest
control, or **Fail next send** followed by a message to try failure and Retry.
Requests can be accepted or deleted, and the sample remote and refused threads
retain their distinct states. GIF tiles are original CSS animations, not live
GIPHY results; the voice memo is a visual sample without audio. No messaging API,
WebSocket, upload, or browser storage is used by this mock. **Reset** restores
the fixtures and clears pending simulated sends.

This mock stays focused on direct messages. Native member-only group chats live
at `/g/[handle]/chat` and in Messages' Groups folder; `tests/e2e/group-chat.spec.ts`
exercises those actual components with HTTP/session/mailbox boundary fixtures.

## Conventions

- **`_data/`** holds all fixtures and their types. Fields are annotated with
  the real column they stand in for (`socialStatuses.content`,
  `profiles.primaryImageCdn`, and so on) so swapping to live data is
  mechanical rather than interpretive.
- **`_components/`** holds the mock's components. Leading `_` keeps both
  folders out of the router.
- **`app/mock/_data/` and `app/mock/_components/`** hold the pieces more than
  one mock needs — the surface registry fixtures, the masthead, the surface
  switcher, the browser frame. A mock-specific folder stays inside that mock;
  it only moves up when a second mock imports it.
- **Shared primitives** live in `app/globals.css` and are deliberately reused
  across mocks. A post card looks the same on the profile and in the feed
  because it is literally the same `.profile-card`.
- **Derived numbers are computed, never typed.** Tab counts come from the same
  function that returns the rendered list, so a mock cannot advertise a number
  it does not render.
- Each mock ends with a footer note naming its own route, so a screenshot
  taken out of context still says where it came from.

## Four-tab app preview

`/mock/app` is a standalone, member-view app mock on any hostname. It uses
the existing feed, directory, events, and groups fixtures inside a shared
mobile frame. The four bottom destinations are Directory, Social, Community,
and Profile, in that order. Directory is the default opening tab; explicit
tab and profile links still take precedence. The first three are persistent
tabs; Profile is an avatar-style
link to the existing `https://panamia.club/p/nochillnerd` page, as selected
for this preview. It opens a new browser tab so the mock stays available.
This is not an authenticated current-user lookup or a profile redesign.
The header keeps notifications, without a duplicate account avatar.

Each screen opens directly on its content, without introductory headings or
taglines. Social uses compact, underlined text filters instead of padded
pills. These stay pinned below the header as the feed scrolls, keeping the
selected feed visible and switchable. On phone-sized screens the frame fills
the viewport.

Community defaults to **Yours**, with a compact, pinned Yours / Discover row.
Yours shows joined groups with their available recent-activity counts and
upcoming events marked Going or Interested. Pending requests are not treated
as memberships. A separate Saved events shortcut opens bookmarks without
implying attendance. Initial memberships and RSVPs are explicit fixtures, not
the linked member's real activity.

Yours keeps its vertically stacked cards. Discover instead uses one horizontal,
swipeable card row per kind, following the site's rail pattern with a peek of
the next card, without previous/next buttons. Touch swipes, horizontal scrolling,
and Left/Right/Home/End keyboard paging still work.
There is no autoplay, and reduced motion disables smooth paging. All matching
picks remain in their row rather than adding vertical cards; rows retain their
position across view changes and profile navigation. The full browse screens
remain vertical behind the existing view-all shortcuts.

Discover uses square, photo-led cards rather than compact rows. Events add
their venue, a short description, and the same locally adjusted attendance
count as full browsing. Groups add their cover, summary, topics, member count,
and public weekly activity; places add their tagline, location, categories,
and recommendation signal. Recommendation reasons stay visible over the cover.
Titles and descriptions are capped at two lines, with full details available
at the existing card destinations. Missing covers retain the tinted icon
fallback, and online places keep their online location instead of a map pin.

Discover combines event, group, and directory picks with a reason on each card
and shortcuts to browse each kind. Event picks reuse `/mock/events`' computed
recommendation lanes. Group topics and listing categories are matched against
explicit sample interests; private and invite-only groups are not recommended.
Already-joined groups and events already in Your plans are omitted from
Discover picks. Events and Groups reuse the existing browse screens, with
shared local membership, request, save, and RSVP state. Joining a group or
marking an event Going/Interested immediately updates Yours; saving an event
does not add it to Your plans. Selecting an RSVP again removes it, and capped
events disable Going when full. No live membership or RSVP requests are sent.

Full browsing replaces the two-way row with a compact Back to Yours/Discover
bar rather than stacking more navigation. Back restores the originating home
and shortcut focus. Each pane stays mounted and scrolls independently;
state survives bottom-tab changes. The Your groups, View plans, Saved events,
and All events/groups shortcuts deliberately select their corresponding
browse filters. Places also links to the dedicated map-first Directory.

Directory's search bar includes a compact **Directory / Events / Groups**
selector that reuses the main site's actual `ScopeMenu`, including its
category icons, canonical orange/pink/indigo tones, and keyboard navigation.
The embedded menu offers only these three categories and does not advertise
separate destination pages. Production picker defaults remain unchanged.
Switching categories keeps the search term in the same bottom tab:
directory listings and events use the shared map-and-sliding-sheet view,
while groups use a searchable vertical list with fixture-backed detail previews.
Only directory listings show business-category chips.
Search covers the full event/group catalogs, not just Discover recommendations,
and matches names, descriptions, locations, and relevant tags or group handles.
Words can match across fields; casing, accents, and extra whitespace are ignored.
No-result lists offer Clear search. Each map retains its own sheet position,
selection, fitted preview, and list scroll independently of the other map.
Groups retain their list scroll too, including across bottom-tab changes.
Returning to a category preserves that state unless the shared search term
changed, in which case its results reset to the new query.
The search previews omit mutable membership and attendance counters rather than
contradicting Community's locally updated state. Groups expose only their
listed identity, summary, visibility, and topics, not private activity.

The directory-listing category opens map-first, with floating search controls and a
results sheet that snaps to peek, half-open, and expanded positions. Drag
its handle, tap it to toggle the full list, or use Up/Down and Home/End;
Escape returns to the map. Selecting a pin shows only that place's card,
with the sheet fitted to its rendered height and padding above the bottom
tabs. Dragging the handle, using its keyboard controls, or tapping
"Show all" restores the complete list in its original order, scrolled to
the selected place. Scrolling stays inside the results and respects
reduced motion. Online and service-area finds remain in the list without
inventing a storefront pin. The four bottom tabs stay outside the sheet.
The map is drawn from fixtures, not live tiles or a location request.

Events use the same map controls, sheet stops, and single-card fitting.
Their fixtures have no exact venue coordinates, so the map explicitly labels
its pins as illustrative event areas, not venue locations. Matching physical
and hybrid events are grouped into Miami-Dade, Broward, and Palm Beach County
area pins. A multi-event pin opens that area's matching events; a single-event
pin reveals just that event's card, including its date and venue. Show all or
the sheet controls restore the full ordered result list. Online-only events
stay searchable and appear in the sheet without a map pin, with an explicit
online notice when they are the only results. Event cards open the existing
fixture preview dialog and restore focus on close.

Directory cards open a fixture-backed profile navigation stand-in inside the
app frame, not a dialog. The production destination is the existing `/p/[user]`
profile page, not a new profile design. The stand-in uses the same fixture
for its cover, identity, categories, community signal, about text, location,
and optional next event.
Back returns to the previous map/list, preserving filters, sheet position,
scroll position, and focus on the card. The four bottom tabs remain available.
Sample profiles have local `#directory/{fixtureId}` links, which support
browser Back/Forward and direct opening. A directly opened profile returns
to its selected map preview; an unknown fixture shows a profile-not-found
screen. Community place cards reuse this stand-in with `#community/place/{fixtureId}`
links; Back returns to the originating Discover pane, scroll, and card focus
rather than taking the member to the map. These are not invented live
`/p/{handle}` links for fictional businesses. Earlier `#explore` and
`#explore/place/{fixtureId}` preview links still open Community.

The tabs, directory map/list selection and filters, sheet position, event
saves and RSVPs, post likes, group joins/requests, and detail previews are interactive.
Their state survives tab changes but resets on reload. All changes are
browser-local: no camera or location access, account changes, uploads,
RSVPs, or membership requests are sent.
This does not change the native app's real starting page or navigation.

## Mocks that compare two designs

`/mock/dms` is the first mock that renders **two** designs rather than one, so
it has a convention of its own worth repeating if another comparison mock is
built.

- **One fixture set, both models.** Each design reads the same `_data/`
  threads. A comparison where each side gets its own content is not a
  comparison, it is two demos.
- **Fixtures are written against the weaker case for each side.** Long
  paragraphs flatter mail and short bursts flatter chat, so both appear: one
  thread is two paragraphs, another is six-word replies. Choosing content that
  suits the design you prefer is how a mock pre-decides the question it was
  built to ask.
- **Shared primitives stay small on purpose.** Only the pieces that should look
  identical in both models — avatar, name, unread badge — are shared. Pushing
  the list, the transcript, and the composer into one component with a
  `variant` prop would converge the two designs and defeat the comparison.
- **Both models' costs stay on screen.** The gains and costs of the inactive
  model are rendered alongside the active one, so whichever is on screen cannot
  appear free.

That comparison has since been decided in favour of chat, on the direct-status
substrate, with live delivery — see `docs/CHAT-ROADMAP.md`. `/mock/dms` is kept
rather than deleted because it is the argument the decision rests on, and
`/mock/dm-chat` draws what the decision implies. A comparison mock becomes a
record once it is answered, so the two are read together: one asks, one
commits.

## Legal terms

`app/mock` is classified `exempt` in `app/legal/terms/namespaces.json`: the
mocks collect nothing, store nothing, and are not a user-facing feature.
