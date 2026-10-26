# Components Directory

Reusable React components used throughout the application.

## UI Components (`ui/`)

Base components from [shadcn/ui](https://ui.shadcn.com/) - the building blocks:

| Component           | Description                  |
| ------------------- | ---------------------------- |
| `accordion.tsx`     | Collapsible content sections |
| `alert-dialog.tsx`  | Confirmation dialogs         |
| `avatar.tsx`        | User avatars                 |
| `badge.tsx`         | Status/category badges       |
| `button.tsx`        | Button variants              |
| `calendar.tsx`      | Date picker calendar         |
| `card.tsx`          | Content cards                |
| `checkbox.tsx`      | Checkbox input               |
| `dialog.tsx`        | Modal dialogs                |
| `dropdown-menu.tsx` | Dropdown menus               |
| `form.tsx`          | Form wrapper with validation |
| `input.tsx`         | Text inputs                  |
| `label.tsx`         | Form labels                  |
| `progress.tsx`      | Progress bars                |
| `radio-group.tsx`   | Radio button groups          |
| `scroll-area.tsx`   | Custom scrollable areas      |
| `select.tsx`        | Select dropdowns             |
| `table.tsx`         | Data tables                  |
| `tabs.tsx`          | Tab navigation               |
| `textarea.tsx`      | Multi-line text input        |
| `toast.tsx`         | Toast notifications          |
| `toaster.tsx`       | Toast container/viewport     |

## Admin Components (`Admin/`)

Components for admin interfaces:

| Component            | Description                                     |
| -------------------- | ----------------------------------------------- |
| `nav.tsx`            | Sidebar navigation; active state by pathname    |
| `overview.tsx`       | The `/admin` index — tools as rows with blurbs  |
| `gate.tsx`           | `useAdminGate()` — client-side admin check      |
| `eyebrow.tsx`        | Group label above a page title                  |
| `status-pill.tsx`    | `MOCK` / `SOON` tag on a tool name              |
| `parts.tsx`          | Shared furniture: `Panel`, `StatBand`           |
| `mock-controls.tsx`  | Inert controls for the mocked views             |
| `mock-bar.tsx`       | "This page is fixtures" banner                  |

## Form Components (`Form/`)

Specialized form inputs:

| Component           | Description              |
| ------------------- | ------------------------ |
| `ImageUploader.tsx` | Drag-drop image upload   |
| `Required.tsx`      | Required field indicator |

## Page Components (`Page/`)

Page-level utilities:

| Component                    | Description              |
| ---------------------------- | ------------------------ |
| `FullPage.tsx`               | Full-page layout wrapper |
| `Status401_Unauthorized.tsx` | Unauthorized error page  |

## Flower Power (`flower-power/`)

Pana MIA brand animations and effects:

| Component                  | Description                  |
| -------------------------- | ---------------------------- |
| `FlowerPowerProvider.tsx`  | Context provider for effects |
| `FlowerPowerAttribute.tsx` | Flower attribute display     |
| `PetalBurst.tsx`           | Petal animation effect       |
| `CursorTrail.tsx`          | Cursor trail effect          |
| `GlobalButtonEvasion.tsx`  | Button evasion animation     |
| `AudioPlayer.tsx`          | Audio player with effects    |

## Article Components

| Component                     | Description                           |
| ----------------------------- | ------------------------------------- |
| `ArticleCard.tsx`             | Article preview card                  |
| `ArticleEditor.tsx`           | Markdown editor with preview          |
| `ArticleByline.tsx`           | Author attribution line               |
| `ArticleTypeBadge.tsx`        | Article type indicator                |
| `ArticleSearch.tsx`           | Search articles (for replies)         |
| `ArticleMastodonSettings.tsx` | Author settings for Mastodon comments |

## Notification Components

| Component                        | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `account/notifications-menu.tsx` | Masthead bell, unread badge and recent list |
| `NotificationAlerts.tsx`         | Tab-title count and desktop toasts          |
| `NotificationItem.tsx`           | Single notification display (`/updates`)    |

The masthead bell is built on `account/menu-surface.tsx`, the same frame the
identity and signed-out menus use, so the two masthead popups behave alike —
dropdown on desktop, bottom sheet on phones. It replaced a `NotificationFlower`
/ `NotificationDropdown` pair that was written against the shadcn dropdown and
never mounted anywhere.

## Mastodon Components

| Component              | Description                          |
| ---------------------- | ------------------------------------ |
| `MastodonComments.tsx` | Display Mastodon replies as comments |

## Layout Components

| Component             | Description                                  |
| --------------------- | -------------------------------------------- |
| `MainHeader.tsx`      | Site header with navigation                  |
| `MainFooter.tsx`      | Site footer                                  |
| `HeroBar.tsx`         | Page hero section                            |
| `CallToActionBar.tsx` | Profile completion or test-site announcement  |

The main header does not display a newsletter signup banner. Visitors can
still subscribe through the newsletter form on `/info#newsletter-signup`.

## Branding Components

| Component             | Description           |
| --------------------- | --------------------- |
| `PanaLogo.tsx`        | Pana MIA logo         |
| `PanaLogoLong.tsx`    | Extended logo version |
| `PanaButton.tsx`      | Branded button style  |
| `PanaLinkButton.tsx`  | Branded link button   |
| `PanaProfileCard.tsx` | Profile card display  |

## Utility Components

| Component              | Description                              |
| ---------------------- | ---------------------------------------- |
| `AuthorBadge.tsx`      | Author attribution with verification     |
| `UserSearch.tsx`       | Search users (for co-authors, reviewers) |
| `ScreennamePrompt.tsx` | Prompt to set screenname                 |
| `SignupModal.tsx`      | Signup modal dialog                      |
| `Spinner.tsx`          | Loading spinner                          |
| `Entity.tsx`           | Entity display component                 |
| `DropDownBtn.tsx`      | Dropdown button                          |
| `GlobalHead.tsx`       | Global head metadata                     |
| `PageMeta.tsx`         | Page-specific metadata                   |

## Theme Components

| Component            | Description              |
| -------------------- | ------------------------ |
| `theme-provider.tsx` | Dark/light theme context |
| `theme-toggle.tsx`   | Theme toggle button      |

## Conventions

- **Naming**: PascalCase for components (`ArticleCard.tsx`)
- **Styling**: CSS modules (`.module.css`) or Tailwind
- **Client**: Use `'use client'` directive for interactive components
- **Props**: Define interface in same file or import from `/types`

## Adding Components

1. Create component in appropriate location
2. Add TypeScript props interface
3. Use existing UI components from `ui/` when possible
4. Add CSS module if needed for complex styles
5. Update this README for major new components
