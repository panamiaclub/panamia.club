import { test, expect, type Page } from '@playwright/test';

const SECTIONS = [
  'our-story',
  'why-local',
  'pillars',
  'meet-the-team',
  'collaborative-projects',
] as const;

async function expectSectionAtTop(page: Page, id: string) {
  const section = page.locator(`section#${id}`);
  await expect(section.getByRole('heading', { level: 2 })).toBeInViewport();
  await expect
    .poll(() =>
      section.evaluate((element) =>
        Math.abs(
          element.getBoundingClientRect().top -
            parseFloat(getComputedStyle(element).scrollMarginTop)
        )
      )
    )
    .toBeLessThan(3);
}

async function openAboutMenu(page: Page) {
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(async () => {
    if (!(await drawer.isVisible())) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
    }
    await expect(drawer).toBeVisible({ timeout: 1000 });
  }).toPass();

  const expand = drawer.getByRole('button', {
    name: 'Expand About Pana submenu',
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  return drawer;
}

test.describe('About section URLs', () => {
  for (const section of SECTIONS) {
    test(`${section} opens the complete page at its section`, async ({
      page,
    }) => {
      const response = await page.goto(`/about-us/${section}`);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(`/about-us/${section}`);
      expect(new URL(page.url()).hash).toBe('');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        /\/about-us$/
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Local is a relationship.'
      );
      for (const id of SECTIONS) {
        await expect(page.locator(`section#${id}`)).toHaveCount(1);
      }
      await expectSectionAtTop(page, section);
    });
  }

  test('a section URL still works after reloading', async ({ page }) => {
    await page.goto('/about-us/our-story');
    await expectSectionAtTop(page, 'our-story');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.reload();
    await expectSectionAtTop(page, 'our-story');
    expect(new URL(page.url()).pathname).toBe('/about-us/our-story');
  });

  test('section navigation supports repeated clicks and browser history', async ({
    page,
  }) => {
    await page.goto('/about-us');
    const navigation = page.getByRole('navigation', {
      name: 'About Pana sections',
    });
    const story = navigation.getByRole('link', {
      name: 'Our Story',
      exact: true,
    });
    await expect(story).toHaveAttribute('href', '/about-us/our-story');
    await story.click();
    await expect(page).toHaveURL(/\/about-us\/our-story$/);
    await expectSectionAtTop(page, 'our-story');

    await page.evaluate(() => window.scrollTo(0, 0));
    await story.click();
    await expectSectionAtTop(page, 'our-story');

    await navigation.getByRole('link', { name: /Three pillars/ }).click();
    await expect(page).toHaveURL(/\/about-us\/pillars$/);
    await expectSectionAtTop(page, 'pillars');

    await page.goBack();
    await expect(page).toHaveURL(/\/about-us\/our-story$/);
    await expectSectionAtTop(page, 'our-story');
    await page.goForward();
    await expect(page).toHaveURL(/\/about-us\/pillars$/);
    await expectSectionAtTop(page, 'pillars');
  });

  test('the site menu links to the section URLs', async ({ page }) => {
    await page.goto('/about-us');
    let drawer = await openAboutMenu(page);
    for (const [label, section] of [
      ['Our Story', 'our-story'],
      ['Meet the Team', 'meet-the-team'],
      ['Why local', 'why-local'],
      ['Pillars', 'pillars'],
    ]) {
      await expect(
        drawer.getByRole('link', { name: label, exact: true })
      ).toHaveAttribute('href', `/about-us/${section}`);
    }
    await drawer
      .getByRole('link', { name: 'Meet the Team', exact: true })
      .click();
    await expect(page).toHaveURL(/\/about-us\/meet-the-team$/);
    await expect(drawer).not.toBeVisible();
    await expectSectionAtTop(page, 'meet-the-team');

    await page.evaluate(() => window.scrollTo(0, 0));
    drawer = await openAboutMenu(page);
    await drawer
      .getByRole('link', { name: 'Meet the Team', exact: true })
      .click();
    await expectSectionAtTop(page, 'meet-the-team');
  });

  test('section links work on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/about-us/meet-the-team');
    expect(response?.status()).toBe(200);
    await expectSectionAtTop(page, 'meet-the-team');

    await page
      .getByRole('navigation', { name: 'About Pana sections' })
      .getByRole('link', { name: 'Our Story', exact: true })
      .click();
    await expect(page).toHaveURL(/\/about-us\/our-story$/);
    await expectSectionAtTop(page, 'our-story');
  });

  test('existing fragment links still reach their section', async ({
    page,
  }) => {
    const response = await page.goto('/about-us#meet-the-team');
    expect(response?.status()).toBe(200);
    await expectSectionAtTop(page, 'meet-the-team');
    await expect(page).toHaveURL(/\/about-us#meet-the-team$/);
  });

  for (const path of ['/about-us/not-a-section', '/about-us/our-story/extra']) {
    test(`${path} returns not found`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { name: '404 - Page Not Found' })
      ).toBeVisible();
    });
  }
});
