import { test, expect, type Page } from '@playwright/test';

const PAGES = [
  ['/about-us', 'About Pana sections'],
  ['/our-impact', 'Our Impact sections'],
  ['/ecosystem', 'Our Ecosystem sections'],
  ['/support-pana', 'Support Pana sections'],
  ['/programs', 'Programs sections'],
] as const;

function masthead(page: Page) {
  return page
    .getByRole('banner')
    .getByRole('link', { name: 'Pana Mia', exact: true })
    .locator('..')
    .locator('..');
}

async function expectBarsFlush(page: Page, navigationLabel: string) {
  const header = masthead(page);
  const navigation = page.getByRole('navigation', { name: navigationLabel });
  await expect(header).toBeInViewport({ ratio: 1 });
  await expect(navigation).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const [headerBottom, navigationTop] = await Promise.all([
        header.evaluate((element) => element.getBoundingClientRect().bottom),
        navigation.evaluate((element) => element.getBoundingClientRect().top),
      ]);
      return Math.abs(navigationTop - headerBottom);
    })
    .toBeLessThan(1);
}

for (const screen of [
  {
    name: 'desktop',
    viewport: { width: 1366, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  {
    name: 'touch phone',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
]) {
  test.describe(`Sticky section navigation on ${screen.name}`, () => {
    test.use({
      viewport: screen.viewport,
      isMobile: screen.isMobile,
      hasTouch: screen.hasTouch,
    });

    for (const [path, navigationLabel] of PAGES) {
      test(`${path} stays flush below the logo bar while scrolling`, async ({
        page,
      }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));

        for (const top of [1200, 2400]) {
          await page.evaluate(
            (scrollTop) =>
              window.scrollTo({ top: scrollTop, behavior: 'instant' }),
            top
          );
          await expectBarsFlush(page, navigationLabel);
        }
      });
    }
  });
}

test('sticky section navigation tracks viewport and text-size changes', async ({
  page,
}) => {
  await page.goto('/about-us');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  for (const width of [1366, 390, 320, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() =>
      window.scrollTo({ top: 1800, behavior: 'instant' })
    );
    await expectBarsFlush(page, 'About Pana sections');
  }

  const originalHeight = await masthead(page).evaluate(
    (element) => element.getBoundingClientRect().height
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '20px';
  });
  await expect
    .poll(() =>
      masthead(page).evaluate(
        (element) => element.getBoundingClientRect().height
      )
    )
    .toBeGreaterThan(originalHeight);
  await expectBarsFlush(page, 'About Pana sections');
});

test('sticky section navigation includes the masthead top inset', async ({
  page,
}) => {
  await page.goto('/about-us/our-story');
  await masthead(page).evaluate((element) => {
    element.style.top = '24px';
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.scrollTo({ top: 1800, behavior: 'instant' });
  });
  await expectBarsFlush(page, 'About Pana sections');
});
