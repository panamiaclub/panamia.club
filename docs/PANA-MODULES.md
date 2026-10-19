# Pana Modules

This document cross-references every platform module by its URL namespace, maturity level, and corresponding documentation.

---

## Module Registry

| Namespace   | Module            | Description                                                       | Maturity | Docs                                                                                                              |
| ----------- | ----------------- | ----------------------------------------------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------- |
| `/`         | **Home**          | Landing page — featured articles, directory CTA, FAQ              |    3     | —                                                                                                                 |
| `/a`        | **Articles**      | Community content platform: create, co-author, review, publish    |    2     | [ARTICLES.md](ARTICLES.md) · [ARTICLE-ROADMAP.md](ARTICLE-ROADMAP.md)                                             |
| `/d`        | **Directory**     | Browse & search South Florida businesses and creatives            |    3     | —                                                                                                                 |
| `/m`        | **Mentoring**     | Peer-to-peer mentoring: discover, schedule, and run sessions      |    2     | [MENTORING-ROADMAP.md](MENTORING-ROADMAP.md)                                                                      |
| `/p`        | **Profiles**      | Public member profiles: bio, images, social links, posts          |    3     | —                                                                                                                 |
| `/s`        | **Social**        | ActivityPub microblogging: timeline, posts, media, federation     |    3     | [SOCIAL-ROADMAP.md](SOCIAL-ROADMAP.md) · [SCREENNAME.md](SCREENNAME.md)                                           |
| `/e`        | **Events**        | Community events — browse and RSVP                                |    0     | —                                                                                                                 |
| `/r`        | **Resilience**    | Community Nostr relay: keypair enrollment, NIP-29 groups, NIP-05  |    2     | [RESILIENCE-ROADMAP.md](RESILIENCE-ROADMAP.md) · [RELAY-ABUSE-REPORTS-ROADMAP.MD](RELAY-ABUSE-REPORTS-ROADMAP.MD) |
| `/account`  | **Account**       | Authenticated user hub: settings, profile editor, article history |    3     | [SIGNIN.md](SIGNIN.md)                                                                                            |
| `/admin`    | **Admin**         | Staff tools: moderation, user management, analytics, metrics      |    2     | —                                                                                                                 |
| `/donate`   | **Donations**     | Stripe-powered fundraising with membership tiers                  |    2     | —                                                                                                                 |
| `/form`     | **Forms**         | Onboarding flows: get-listed, contact, affiliate, join-team       |    2     | —                                                                                                                 |
| `/signin`   | **Auth**          | Passwordless sign-in: magic link, Google, Apple, Mastodon OAuth   |    2     | [SIGNIN.md](SIGNIN.md)                                                                                            |
| `/links`    | **Link Hub**      | Centralised link page for social sharing                          |    2     | —                                                                                                                 |
| `/podcasts` | **PanaVizión**    | YouTube podcast episode gallery                                   |    4     | —                                                                                                                 |
| `/updates`  | **Notifications** | Voice memos, @-mentions, Pana Updates notification feed           |    3     | [NOTIFICATIONS-ROADMAP.md](NOTIFICATIONS-ROADMAP.md)                                                              |

---

## Maturity Levels

| Level | Meaning                                                                |
| :---: | ---------------------------------------------------------------------- |
|   0   | Placeholder — namespace reserved, nothing implemented                  |
|   1   | Concept — scaffolded or early prototype, not functional                |
|   2   | In progress — core flows work, key features incomplete                 |
|   3   | Feature-complete — needs polish, QA, or edge cases                     |
|   4   | Production-ready — stable and ready for production                     |
|   5   | User-ready — deployed, documented, and ready for user support requests |

---

## Namespace Notes

- **`/d`** — canonical directory URL; `/directory` and `/directorio` redirect here.
- **`/p`** — public profile pages at `/p/[screenname]`; individual post permalinks at `/p/[screenname]/[postId]`.
- **`/s`** — Social module; `/timeline` redirects here.
- **`/e`** — reserved for Events; not yet implemented.
- **`/r`** — Resilience Network; the relay itself is a standalone Worker consumed over a Service Binding, so only the enrollment and group-management surface lives here.
- **`/admin`** — admin routes; served under `admin.panamia.club`, which redirects `/` to `/admin`. Legacy `/account/admin/*` paths redirect here. Tool list in `lib/admin/views.ts`.

---

## Related Docs

| Doc                                            | Scope                                               |
| ---------------------------------------------- | --------------------------------------------------- |
| [QUICK-START.md](QUICK-START.md)               | Dev setup, build commands, deployment               |
| [DATABASE-DESIGN.md](DATABASE-DESIGN.md)       | Drizzle ORM schema, Hyperdrive, migrations          |
| [FEATURES.md](FEATURES.md)                     | High-level feature overview (narrative format)      |
| [TESTING-ROADMAP.md](TESTING-ROADMAP.md)       | Playwright coverage plan by module                  |
| [CONTRIBUTING.md](CONTRIBUTING.md)             | Commit scopes, PR workflow, code standards          |
| [FLOSS-ALTERNATIVES.md](FLOSS-ALTERNATIVES.md) | Open-source service philosophy                      |
| [MASTODON-COMMENTS.md](MASTODON-COMMENTS.md)   | Linking articles to Mastodon for federated comments |
