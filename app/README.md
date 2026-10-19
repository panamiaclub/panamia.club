# App Directory

Next.js 16 App Router directory containing all pages, layouts, and API routes.

## Page Routes

### Public Pages

| Route               | Description                                  |
| ------------------- | -------------------------------------------- |
| `/`                 | Homepage with featured profiles and articles |
| `/about-us`         | About Pana MIA page                          |
| `/directory`        | Browse business directory                    |
| `/directory/search` | Search directory with filters                |
| `/directorio`       | Spanish alias for directory                  |
| `/a`                | Browse community articles                    |
| `/a/[slug]`         | View single article                          |
| `/a/new`            | Create new article (auth required)           |
| `/p/[user]`         | Public profile view                          |
| `/s`                | Social timeline (auth required)              |
| `/e/[slug]`         | View single event                            |
| `/venues`           | Browse venues                                |
| `/venues/[slug]`    | View single venue                            |
| `/signin`           | Authentication page                          |
| `/links`            | Link tree style page                         |
| `/podcasts`         | Podcast listings                             |
| `/donate`           | Donation page                                |

### Account Pages (`/account/*`)

Authenticated user pages for managing their own content:

| Route                          | Description                                             |
| ------------------------------ | ------------------------------------------------------- |
| `/account/user/edit`           | Edit user settings (email, screenname, default license) |
| `/account/profile`             | Profile dashboard                                       |
| `/account/profile/edit`        | Edit profile basics                                     |
| `/account/profile/desc`        | Edit profile description                                |
| `/account/profile/address`     | Edit location/address                                   |
| `/account/profile/contact`     | Edit contact info                                       |
| `/account/profile/social`      | Edit social links                                       |
| `/account/profile/categories`  | Edit business categories                                |
| `/account/profile/images`      | Manage profile images                                   |
| `/account/profile/gentedepana` | Gente de Pana settings                                  |
| `/account/articles`            | Manage your articles                                    |
| `/updates`                     | View updates & send voice memos                         |
| `/account/admin/*`             | Legacy admin paths; redirect to `/admin/*`              |

### Admin Pages (`/admin/*`)

Site administration (requires admin role). Served under `admin.panamia.club`,
which redirects `/` to `/admin`. Every page shares the sidebar defined in
`app/admin/layout.tsx`; the tool list itself lives in `lib/admin/views.ts`.

| Route                      | Description                                  |
| -------------------------- | -------------------------------------------- |
| `/admin`                   | Overview — what each tool is for             |
| `/admin/listings`          | Directory listing approvals                  |
| `/admin/connectors`        | Pana Connectors console                      |
| `/admin/users`             | Account management (mock)                    |
| `/admin/users/live`        | The real account list the mock replaces       |
| `/admin/download-profiles` | Export profile data                          |
| `/admin/contactus`         | Contact form submissions                     |
| `/admin/reports`           | Relay abuse reports                          |
| `/admin/profile/action`    | Profile moderation from an email link        |
| `/admin/mentoring`         | Mentoring program admin — parked, see below  |
| `/admin/articles`          | Article moderation — parked, see below       |
| `/admin/podcasts`          | Podcast management — parked, see below       |

**Parked tools.** Mentoring, Articles and Podcasts still work but are no
longer in the sidebar or the overview, so that the surface stays pointed at
the things being used now. The routes and their API endpoints are untouched,
and the `/account/admin/*` redirects still reach them — which matters, because
staff notification emails embed those old URLs. `PARKED_TOOLS` in
`lib/admin/views.ts` is the list, and the overview renders it so the decision
is visible rather than remembered.

### Mentoring (`/m/*`)

Mentorship program pages:

| Route                       | Description                                         |
| --------------------------- | --------------------------------------------------- |
| `/m/discover`               | Find mentors                                        |
| `/m/profile`                | Your mentor/mentee profile                          |
| `/m/profile/edit`           | Edit mentoring profile                              |
| `/m/schedule`               | View/manage schedule                                |
| `/m/schedule/book`          | Book a session                                      |
| `/m/session/[id]`           | View session details                                |
| `/m/webrtc-test`            | Video-call proof-of-concept (WebRTC + DO signaling) |
| `/m/webrtc-test/whiteboard` | Collaborative whiteboard (popup/standalone)         |

### Events (`/e/*`) & Venues (`/venues/*`)

Community events and the venues that host them:

| Route                        | Description              |
| ---------------------------- | ------------------------ |
| `/e/[slug]`                  | View single event        |
| `/e/[slug]/edit`             | Edit event (organizer)   |
| `/e/[slug]/manage/attendees` | Manage RSVPs (organizer) |
| `/e/[slug]/manage/notes`     | Organizer notes          |
| `/e/[slug]/manage/photos`    | Manage event photos      |
| `/venues`                    | Browse venues            |
| `/venues/new`                | Create a venue           |
| `/venues/[slug]`             | View single venue        |

### Forms (`/form/*`)

Public submission forms:

| Route                       | Description            |
| --------------------------- | ---------------------- |
| `/form/contact-us`          | Contact form           |
| `/form/get-listed`          | Directory listing form |
| `/form/list-your-business`  | Redirect to the above  |
| `/form/become-a-pana`       | Redirect to the above  |
| `/form/become-an-affiliate` | Affiliate application  |
| `/form/join-the-team`       | Team application       |

### Feeds (`/feed*`)

RSS and JSON feeds for articles:

| Route                       | Description                 |
| --------------------------- | --------------------------- |
| `/feed.xml`                 | RSS 2.0 feed (all articles) |
| `/feed.json`                | JSON Feed format            |
| `/feed/author/[screenname]` | Articles by author          |
| `/feed/tag/[tag]`           | Articles by tag             |
| `/feed/type/[type]`         | Articles by type            |

### Other Pages

| Route                                 | Description              |
| ------------------------------------- | ------------------------ |
| `/affiliate`                          | Affiliate portal         |
| `/donation/confirmation`              | Post-donation page       |
| `/doc/terms-and-conditions`           | Terms of service         |
| `/doc/affiliate-terms-and-conditions` | Affiliate terms          |
| `/become-a-pana`                      | Redirect to listing form |
| `/contact-us`                         | Redirect to contact form |
| `/migrate-email`                      | Email migration flow     |
| `/verify-oauth-email`                 | OAuth email verification |

## API Routes

See [app/api/README.md](./api/README.md) for comprehensive API documentation.

## File Conventions

| File            | Purpose                             |
| --------------- | ----------------------------------- |
| `page.tsx`      | Main component rendered for route   |
| `layout.tsx`    | Shared layout wrapping child routes |
| `loading.tsx`   | Loading UI while route loads        |
| `error.tsx`     | Error boundary for route            |
| `route.ts`      | API route handler                   |
| `not-found.tsx` | Custom 404 page                     |

## Dynamic Route Patterns

| Pattern      | Usage                                    |
| ------------ | ---------------------------------------- |
| `[slug]`     | URL-safe identifier (articles, profiles) |
| `[id]`       | Database ID (UUID or numeric)            |
| `[user]`     | User screenname (profile, federation)    |
| `[...param]` | Catch-all routes                         |

## See Also

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [API Documentation](./api/README.md)
- [Article Roadmap](/docs/ARTICLE-ROADMAP.md)
- [Mentoring Roadmap](/docs/MENTORING-ROADMAP.md)
