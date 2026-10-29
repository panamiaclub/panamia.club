# Testing Roadmap

## GitHub Automated Testing Infrastructure

When code is pushed to GitHub or a pull request is opened, automated tests run against a disposable PostgreSQL instance on that GitHub-hosted runner. No test job connects to the production database or shares a database with another run.

### How It Works

1. **Start isolated PostgreSQL** — Start the runner's database and create the roles and migration ledger required by the SQL migrations.
2. **Validate and apply migrations** — Validate journal completeness, then replay every journaled migration against the empty database.
3. **Run unit and database tests** — Check pure logic and data-layer behavior before starting a browser.
4. **Build the app** — Build the production Worker and static assets.
5. **Run browser tests** — Seed the native browser fixture's public profile destination, then start the built Worker with local Wrangler bindings and the runner's database. This exercises the same entry point as production, including route/chrome headers and request-scoped database setup. `vinext dev` bypasses that custom entry point and is only the default for local development.
6. **Discard the runner** — The database and local bindings are discarded with the job. Browser failures stop after five failing cases, with line output and an HTML report, rather than exhausting the job timeout before diagnostics can upload.

Your production database is never touched during testing.

### Required GitHub Secrets and Variables

Configure in GitHub → Repository Settings → Secrets and variables → Actions:

**Secrets** (sensitive):

| Secret                 | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| `BETTER_AUTH_SECRET`   | Any random 32-byte secret (can differ from production) |
| `ADMIN_EMAILS`         | Test admin email(s)                                    |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key                        |
| `R2_ACCOUNT_ID`        | Cloudflare account ID                                  |
| `R2_ACCESS_KEY_ID`     | R2 API token key ID                                    |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret                                    |

**Variables** (non-sensitive):

| Variable                         | Value                   |
| -------------------------------- | ----------------------- |
| `BETTER_AUTH_URL`                | `http://localhost:3000` |
| `NEXT_PUBLIC_HOST_URL`           | `http://localhost:3000` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key      |
| `NEXT_PUBLIC_APPLE_ENABLED`      | `false`                 |
| `NEXT_PUBLIC_MASTODON_ENABLED`   | `false`                 |
| `NEXT_PUBLIC_WIKIMEDIA_ENABLED`  | `false`                 |
| `R2_BUCKET_NAME`                 | Test media bucket name  |
| `R2_PUBLIC_URL`                  | Test public media URL   |

> **Important**: The test workflow sets `POSTGRES_URL` to runner-local PostgreSQL. Do not replace it with a production secret. Production migration and deployment workflows use their own database configuration.

The browser-test build explicitly enables Google so native sign-in coverage does not depend on deployment feature flags. This must be set at build time, not just when starting the built Worker.

### Workflow File

The test workflow is defined in `.github/workflows/playwright.yml`.

---

## Implemented Playwright Tests

Tests organized by category in `tests/e2e/`:

### Public Navigation (`public-navigation.spec.ts`)

- Homepage, About, Directory, Donate, Affiliate
- Contact forms, Terms and conditions
- Profile pages, Articles

### Authentication Checks (`authenticated-navigation.spec.ts`)

- Account user pages (edit, following, lists)
- Account profile pages (contact, address, categories, desc, social, images)
- Protected route redirects

### Critical Paths (`critical-paths.spec.ts`)

- Directory search → Profile view
- Become a Pana form
- Contact form, Donation flow
- Mentoring features (auth redirects)
- List pages

### Notifications (`notifications.spec.ts`)

- API authentication (401 responses)
- UI visibility for unauthenticated users
- Mark as read API endpoints

### Screenname (`screenname.spec.ts`)

- API authentication requirements
- Author lookup validation

## Deferred Playwright Tests (Auth Required)

These tests require `storageState` authentication setup in Playwright.
See [Playwright Authentication Docs](https://playwright.dev/docs/auth).

### Mentoring - Authentication & Authorization

- [ ] Unauthenticated users redirected to signin page
- [ ] Only session participants can access session pages
- [ ] Pusher channel authentication verifies session membership
- [ ] API routes check authentication via better-auth
- [ ] Users cannot access other users' sessions

### Mentoring - Profile Management

- [ ] User can enable/disable mentoring profile
- [ ] User can add and remove expertise tags (1-10 items)
- [ ] User can add and remove languages (1+ items)
- [ ] Bio validation works (10-500 characters)
- [ ] Video intro URL validation accepts valid URLs only
- [ ] Hourly rate accepts positive numbers
- [ ] Profile changes persist to database
- [ ] Profile view page displays all mentoring information

### Mentoring - Mentor Discovery

- [ ] Discovery page shows only enabled mentors
- [ ] User is excluded from their own search results
- [ ] Expertise filter works correctly
- [ ] Language filter works correctly
- [ ] Free-only filter works correctly
- [ ] Mentor cards display all information (bio, expertise, languages, rate)
- [ ] "Book Session" button navigates with mentor email parameter

### Mentoring - Session Booking

- [ ] Calendar displays correctly with react-day-picker
- [ ] Past dates are disabled
- [ ] Time slots display (9 AM - 5 PM in 30-min intervals)
- [ ] Selected time highlights correctly
- [ ] Duration selection works (15, 30, 60, 90, 120 minutes)
- [ ] Session type selection works (artistic, knowledge_transfer, panamia_planning, pana_support)
- [ ] Topic validation works (5-200 characters)
- [ ] Session creation sends notification to mentor
- [ ] Session appears in mentor's pending requests
- [ ] Form validation prevents invalid submissions

### Mentoring - Session Confirmation Flow

- [ ] Pending sessions show Accept/Decline buttons for mentor
- [ ] Mentor can accept session request
- [ ] Accept changes status to 'scheduled'
- [ ] Accept sends notification to mentee
- [ ] Mentor can decline session request with reason
- [ ] Decline changes status to 'declined'
- [ ] Decline sends notification to mentee with reason
- [ ] Mentee cannot respond to their own requests

### Mentoring - Sessions Dashboard

- [ ] Pending sessions display with confirmation buttons
- [ ] Upcoming (scheduled) sessions display correctly
- [ ] Past sessions display correctly
- [ ] Sessions show correct role (mentor/mentee)
- [ ] Session status badges display correctly
- [ ] "Join Session" button appears for scheduled sessions
- [ ] "Cancel" button works and prompts for reason
- [ ] Cancel sends notification to other party
- [ ] Cancelled sessions show cancellation details
- [ ] Declined sessions show decline reason
- [ ] Session notes display in past sessions
- [ ] Empty state shows when no sessions exist

### Mentoring - Notifications

- [ ] Session request creates notification for mentor
- [ ] Session accept creates notification for mentee
- [ ] Session decline creates notification for mentee
- [ ] Session cancel creates notification for other party
- [ ] Notifications appear in notification dropdown
- [ ] Notification links navigate to correct pages
- [ ] Notifications can be marked as read

### Mentoring - WebRTC Video Sessions

- [ ] Browser prompts for camera/microphone permissions
- [ ] Local video stream displays in corner
- [ ] Remote video stream displays in main area
- [ ] WebRTC signaling via Pusher works
- [ ] Connection indicator updates when established
- [ ] Video quality is acceptable
- [ ] Audio quality is acceptable

### Mentoring - Video Controls

- [ ] Mute button toggles audio on/off
- [ ] Video button toggles camera on/off
- [ ] End Call button terminates session and redirects
- [ ] Button states reflect current status

### Mentoring - Real-time Chat

- [ ] Chat messages send via presence channel
- [ ] Messages appear in real-time for both participants
- [ ] Own messages styled differently from others
- [ ] Chat auto-scrolls to latest message
- [ ] Enter key sends message

### Mentoring - Session Notes

- [ ] Notes textarea displays initial notes
- [ ] Notes auto-save after debounce
- [ ] "Saving..." indicator shows during save
- [ ] Notes persist between page refreshes
- [ ] Both participants can edit notes

### Articles - Co-Author Flow

- [ ] Author can invite co-author by screenname
- [ ] Co-author receives notification
- [ ] Co-author can accept invitation
- [ ] Co-author can decline invitation
- [ ] Accept/decline sends notification to author

### Articles - Review Flow

- [ ] Author can request review by screenname
- [ ] Reviewer receives notification
- [ ] Reviewer can approve article
- [ ] Reviewer can request revisions
- [ ] Review response sends notification to author

## Known Limitations

### WebRTC Connectivity

- No TURN servers configured — P2P may fail behind strict firewalls
- Relies on STUN only for NAT traversal

### Browser Compatibility

- Requires modern browsers with WebRTC support
- Camera/microphone permissions vary by browser

### Concurrent Actions

- Multiple users editing notes simultaneously may conflict
- Race conditions possible in rapid status updates

## User Feedback Comments

_This section tracks user-reported issues and feedback for future improvements._

<!-- Add user feedback below this line -->
