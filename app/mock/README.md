# Design Mocks (`/mock/*`)

Static, hardcoded design mocks used to agree on a surface before it is built
against real data. Nothing here queries the database, and every route is
`noindex` so the mocks never reach search results.

These are not prototypes to be shipped as-is. They are the argument for a
design, written in the real design system so the argument is honest: if a
layout only works with invented spacing or colours that are not in
`app/globals.css`, that shows up here rather than in review.

| Route                     | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `/mock/home`              | Homepage cut to four cards, built from the Connectors deck        |
| `/mock/profile`           | Personal profile page (pana page) redesign                        |
| `/mock/profile-next`      | Pana page, second pass: identity rail left, tabbed content right  |
| `/mock/feed`              | Pana Social feed redesign, including the empty feed               |
| `/mock/composer`          | Friendly social card: inline local media, Everyone/Panas audience |
| `/mock/panaverse`         | Panaverse chrome: masthead, surface switcher, identity            |
| `/mock/settings`          | Account settings — one page, either masthead                      |
| `/mock/directory`         | Directory search results, pre-map                                 |
| `/mock/directory-unified` | One directory theme across businesses, panas, groups and events   |
| `/mock/explore`           | Scope moved into the search bar; directory narrowed to businesses |
| `/mock/groups`            | Groups landing and discover, as two steps of one flow             |
| `/mock/dms`               | Direct messages, as two competing models behind one switch        |
| `/mock/dm-chat`           | The DM conversation view, drawn after that comparison was decided |
| `/mock/events`            | Events discovery: lanes that say why, not facets to narrow with   |
| `/mock/events/host`       | Host an event: the form, answering to the page it feeds           |

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
