# Screenname Feature

This document describes the screenname feature, which provides users with a unique, editable identifier for attribution across community features such as articles, comments, and other contributions.

## Overview

Screennames are semi-public identifiers that:

- Are unique across all users (case-insensitive)
- Can be changed at any time with retroactive effect
- Are required for making public contributions
- Link to the user's profile page when one exists

## Privacy Model

| Field          | Visibility                                           |
| -------------- | ---------------------------------------------------- |
| **Screenname** | Public - displayed on all contributions              |
| **Name**       | Public but optional - displayed alongside screenname |
| **Email**      | Private - never shown to non-admin users             |

## Data Model

### User Schema (Drizzle)

```typescript
// lib/schema/index.ts
export const users = pgTable('users', {
  // ...
  screenname: text('screenname').unique(),
  // ...
});
```

Note: PostgreSQL handles case-insensitive uniqueness via the `citext` extension or application-level normalization. The current implementation normalizes screennames to lowercase before storage.

### Validation Rules

- **Length**: 3-24 characters
- **Characters**: Alphanumeric, underscores (`_`), and hyphens (`-`) only
- **Format**: Cannot start or end with underscore or hyphen
- **Uniqueness**: Case-insensitive (e.g., "JohnDoe" and "johndoe" are considered the same)
- **Reserved words**: Blocked screennames include `admin`, `pana`, `support`, `system`, etc.

## API Endpoints

### Check Screenname Availability

```
GET /api/user/screenname/check?name=desired_screenname
```

**Response:**

```json
{
  "available": true
}
```

or

```json
{
  "available": false,
  "error": "This screenname is already taken"
}
```

**Notes:**

- No authentication required (for real-time validation in forms)
- Validates format before checking database
- Signed-in checks use the authenticated account to exclude its own personal
  profile, current handle, and retired handles, matching the save endpoint.
  A business listing sharing the account's email still reserves its handle.
- Whitespace is trimmed and comparisons are case-insensitive in both checking
  and saving. Personalized availability responses are private and not cached.
- Welcome, modal, and account-settings forms share a debounced checker. Editing
  the handle immediately invalidates the previous result; canceled or older
  responses cannot approve or reject the new input.

### Set/Update Screenname

```
POST /api/user/screenname/set
Content-Type: application/json

{
  "screenname": "desired_screenname"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "screenname": "desired_screenname"
  }
}
```

**Notes:**

- Requires authentication
- Validates format, reserved words, and uniqueness
- Can be used to set initial screenname or update existing

### Author Lookup

```
GET /api/user/author/{userId}
```

**Response:**

```json
{
  "screenname": "user_screenname",
  "verified": true
}
```

or for deleted/non-existent users:

```json
{
  "deleted": true
}
```

**Notes:**

- Public endpoint (no auth required)
- Returns profile verification status when user has a profile

## Regression Coverage

```bash
yarn node --experimental-test-module-mocks --import tsx --test tests-db/screenname-required-fields.test.ts tests-db/screenname-profile-email-collision.test.ts tests-db/social-activation.test.ts tests-db/magic-link.test.ts
yarn playwright test screenname-availability.spec.ts --project chromium
```

The browser suite covers both the legacy popup and the actual new-account
`/welcome` page, including the first-run redirect, empty initial fields, delayed
availability responses, a handle taken during submission, and successful return
to the interrupted page after setup. Fresh sessions are issued through Better
Auth magic links using memory-only storage and intercepted mail delivery.
The fixture only supports local servers and reads the matching auth secret from
the test environment, `.dev.vars`, or `.env.local`; it never creates production
accounts or sends real email.

The database suites exercise the real handlers against isolated PGlite databases.
They verify that rejecting a taken handle leaves a new account untouched, choosing
another handle persists the user, personal profile, and social actor, and two
new signups can recover when one claims a handle after both have checked it.
First claims do not acquire a rename cooldown, and retrying completed setup does
not create another identity.

Fixtures also include unrelated handle history belonging to other live members.
That data must not make an unused name appear taken to signed-in callers; only
history for the requested handle can reserve it. Production deployment runs a
read-only check of anonymous and signed-in availability against the real dataset
using a random unused name. It creates no account or handle reservation.

## Components

### AuthorBadge

Displays author attribution with optional verification badge and profile link.

```tsx
import AuthorBadge from '@/components/AuthorBadge';

<AuthorBadge
  authorId="user_id_here"
  showVerification={true} // default: true
/>;
```

**Behavior:**

- Shows loading skeleton while fetching author data
- Shows "Former Member" for deleted accounts or missing authors
- Links to profile page when user has an active profile
- Displays verification badge (checkmark) when profile is Pana verified

### ScreennamePrompt

Modal dialog for setting screenname, used for lazy creation when users attempt actions requiring attribution.

```tsx
import ScreennamePrompt from '@/components/ScreennamePrompt';

const [showPrompt, setShowPrompt] = useState(false);

<ScreennamePrompt
  open={showPrompt}
  onOpenChange={setShowPrompt}
  onSuccess={(screenname) => {
    console.log('Screenname set:', screenname);
    // Continue with the action that triggered the prompt
  }}
  title="Choose Your Screenname" // optional
  description="Custom description" // optional
/>;
```

## Account Settings

Users can set or update their screenname in Account Settings (`/account/user/edit`):

1. Navigate to Account Settings
2. Find the "Screenname" field
3. Enter desired screenname (real-time availability check)
4. Click "Update" to save

The page includes:

- Real-time availability checking with visual feedback
- Format validation with error messages
- Privacy disclosure explaining what information is public

## Implementation Notes

### Retroactive Changes

All content references `authorId` (user's `id`), not the screenname itself. When a user changes their screenname:

- The change is stored only on the user document
- All `AuthorBadge` components fetch the current screenname from the API
- No database migration or content updates required

### Account Deletion

When a user deletes their account:

- The user document is hard-deleted (removed entirely)
- Content authored by the user remains
- `AuthorBadge` shows "Former Member" for orphaned authorIds

### Lazy Creation Flow

For features requiring attribution (articles, comments, etc.):

1. Check if user has a screenname set
2. If not, show `ScreennamePrompt` dialog
3. After successful screenname creation, continue with original action

```tsx
const handleContribute = async () => {
  const user = await getCurrentUser();

  if (!user.screenname) {
    setShowScreennamePrompt(true);
    setPendingAction('contribute');
    return;
  }

  // Continue with contribution
  submitContribution();
};
```

## Future Considerations

- **User search by screenname**: Add endpoint to find users by screenname
- **@mentions**: Support `@screenname` mentions in content
- **Screenname history**: Track previous screennames for audit purposes
- **Rate limiting**: Add cooldown or limit on screenname changes if abuse occurs
