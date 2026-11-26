# Playwright E2E Tests

This directory contains end-to-end tests for the Panamia application using Playwright.

## Directory Structure

```
tests/
├── e2e/                    # End-to-end test specs
│   ├── public-navigation.spec.ts
│   ├── authenticated-navigation.spec.ts
│   ├── critical-paths.spec.ts
│   ├── notifications.spec.ts
│   ├── mentoring-notifications.spec.ts
│   └── screenname.spec.ts
├── setup/                  # Test setup and fixtures
└── README.md
```

## Test Files

| File                               | Description                          |
| ---------------------------------- | ------------------------------------ |
| `public-navigation.spec.ts`        | Public pages without authentication  |
| `authenticated-navigation.spec.ts` | Routes requiring authentication      |
| `critical-paths.spec.ts`           | Critical user journeys and workflows |
| `notifications.spec.ts`            | Notification system tests            |
| `mentoring-notifications.spec.ts`  | Mentoring notification flow tests    |
| `screenname.spec.ts`               | Screenname selection and validation  |

## Running Tests

```bash
# Run all tests (headless)
npm test

# Run tests with UI
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# View test report
npm run test:report
```

## Pre-commit Integration

A Husky pre-commit hook automatically checks test coverage for modified pages:

- When you modify `app/**/page.tsx` files, the hook searches for corresponding test coverage
- If a modified page lacks test coverage, you'll see a warning (non-blocking)
- Example warning:

  ```
  ⚠️  WARNING: Modified pages may not have Playwright test coverage:

    📄 app/m/profile/page.tsx → /m/profile

  💡 Consider adding test cases to tests/e2e/
  ```

- This reminder helps keep tests from becoming an afterthought

**Note:** Warnings don't block commits - they're just gentle reminders to maintain test coverage.

## CI/CD Integration

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

See `.github/workflows/playwright.yml` for CI configuration.

Static component suites in `tests-unit/` and `tests-db/` use the typed router
fixture in `tests/app-router.ts` with `AppRouterContext.Provider`. Navigation
during rendering fails explicitly; the fixture does not depend on a private
router singleton being exported by vinext's navigation shim.

## Test Coverage

### Public Navigation

- Homepage
- About page
- Directory search
- Donate page
- Affiliate page
- Contact forms
- Terms and conditions
- Profile pages

### Authenticated Routes

- Account user pages (edit, following, lists)
- Account profile pages (contact, address, categories, desc, social, images, gentedepana)
- 404 error prevention

### Critical Paths

- Directory search → Profile view
- Become a Pana form
- Contact form
- Donation flow
- Mentoring features
- List pages

## Adding New Tests

### Quick Start

1. **Interactive mode** (recommended):

   ```bash
   npm run test:ui
   ```

   Use Playwright's UI to record and generate tests

2. **Manual creation**:
   - Add tests to existing suites: `tests/e2e/public-navigation.spec.ts`, `authenticated-navigation.spec.ts`, or `critical-paths.spec.ts`
   - Or create a new `.spec.ts` file in `tests/e2e/`

### Test Organization

Tests are organized by **feature/flow** rather than one-test-per-page:

- **`public-navigation.spec.ts`** - Public pages (home, about, directory, etc.)
- **`authenticated-navigation.spec.ts`** - Auth-required routes (account, profile editing)
- **`critical-paths.spec.ts`** - End-to-end user journeys (signup, search → profile, donations)

**When adding coverage for a new page**, add it to the appropriate existing suite rather than creating a new file (unless it represents a new category).

### Coverage Guidelines

- **Every page route** should have at least one test that navigates to it
- **Critical user flows** should have end-to-end tests
- **Authentication redirects** should be tested for protected routes
- **Form submissions** should validate success/error states

The pre-commit hook will remind you if a modified page lacks coverage.

## Configuration

See `playwright.config.ts` in the project root for Playwright configuration.
