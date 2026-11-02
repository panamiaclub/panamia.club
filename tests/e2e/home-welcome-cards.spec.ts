import { test, expect, type Page } from '@playwright/test';
import home from '../../locales/en/home.json' with { type: 'json' };
import esHome from '../../locales/es/home.json' with { type: 'json' };

const DEFINITIONS = [
  'South American/Caribbean slang meaning friend.',
  'A member of the South Florida community that enjoys engaging with and supporting local community projects, small businesses, and creators.',
  'Someone involved with Pana MIA Club',
  'Someone who enjoys a locally-centered lifestyle',
];
const EXAMPLE =
  'Example: I gotta introduce you to my pana, Jose! He’s the best, always has my back.';
const FUTURE_PARAGRAPHS = [
  'When we say “The Future is Local” it’s because we believe that in order to build better futures for ourselves and our loved ones– the most transformative impact happens on the local level.',
  "In a place like South Florida, where our one constant is change, it's so easy to lose sight of what connects us.",
  'Once we begin to see South Florida and its people as our home, we unlock our power to influence the changes that build the future of South Florida as one we can all thrive in.',
];
const MORE_LABEL = 'Learn more about why “The Future is Local”';
const CARD_TITLES = [
  'What is Pana?',
  "Why 'The Future is Local'?",
  'Why was Pana MIA started?',
];

async function waitForMockClient(page: Page) {
  const roomy = page.getByRole('radio', { name: 'Roomy', exact: true });
  const compact = page.getByRole('radio', { name: 'Compact', exact: true });
  // This measured property is published by the mock's client effect.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--mock-chrome-h')
      )
    )
    .not.toBe('');
  await roomy.click();
  await expect(roomy).toHaveAttribute('aria-checked', 'true');
  await compact.click();
  await expect(compact).toHaveAttribute('aria-checked', 'true');
}

async function openMock(page: Page) {
  const response = await page.goto('/mock/home#what-is-this', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(200);
  await waitForMockClient(page);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('i18nextLng'))
      localStorage.setItem('i18nextLng', 'en');
  });
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: null })
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'laptop', width: 1024, height: 900 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'small phone', width: 320, height: 800 },
]) {
  test(`the ${viewport.name} mock has three collapsed previews and complete expandable copy`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openMock(page);
    await expect(page).toHaveTitle('Homepage (mock) | Pana Mia');
    const cards = page.locator('.beats > .beat');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('.beats-rail')).toHaveAttribute(
      'data-card-count',
      '3'
    );
    await expect(cards.locator('.beat-sign')).toHaveText(CARD_TITLES);
    await expect(cards.locator('.beat-detail:visible')).toHaveCount(0);
    await expect(
      cards.locator('.beat-toggle[aria-expanded="false"]')
    ).toHaveCount(3);

    const pana = cards.nth(0);
    await expect(pana.locator('.beat-copy > .beat-aside')).toHaveText(
      '/pah*nah/'
    );
    await expect(pana.locator('.beat-answer-blocks > p > strong')).toHaveText([
      DEFINITIONS[0],
    ]);
    await expect(pana.locator('.beat-definition')).toBeHidden();
    await expect(pana.locator('.beat-example')).toBeHidden();

    const future = cards.nth(1);
    await expect(future.locator('.beat-answer-blocks > p > strong')).toHaveText(
      [FUTURE_PARAGRAPHS[0]]
    );
    await expect(future.locator('.beat-body-question')).toBeHidden();
    await expect(
      future.getByRole('button', { name: MORE_LABEL, exact: true })
    ).toHaveAttribute('aria-controls', 'beat-future-local');
    expect(
      await future.locator('.beat-art').evaluate((art) => {
        const map = art.querySelector('.statemap-img');
        if (!map) return false;
        const artBounds = art.getBoundingClientRect();
        const mapBounds = map.getBoundingClientRect();
        const padding = getComputedStyle(art);
        return (
          mapBounds.top >=
            artBounds.top + Number.parseFloat(padding.paddingTop) - 1 &&
          mapBounds.bottom <=
            artBounds.bottom - Number.parseFloat(padding.paddingBottom) + 1
        );
      })
    ).toBe(true);

    const why = cards.nth(2);
    await expect(why.locator('.beat-answer')).toHaveText(home.beats.why.answer);
    await expect(why.locator('.beat-toggle')).toHaveText(home.beats.why.more);
    await expect(why.locator('.beat-photo-img')).toHaveAttribute(
      'alt',
      home.beats.why.photoAlt
    );

    expect(
      await cards.evaluateAll((elements) =>
        elements.every((card) => {
          const copy = card.querySelector<HTMLElement>('.beat-copy');
          if (!copy) return false;
          return (
            copy.scrollWidth <= copy.clientWidth + 1 &&
            copy.scrollHeight <= copy.clientHeight + 1 &&
            copy.getBoundingClientRect().bottom <=
              card.getBoundingClientRect().bottom + 1
          );
        })
      )
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);

    if (viewport.width >= 960) {
      expect(
        await page
          .locator('.beats')
          .evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(' ').length
          )
      ).toBe(3);
      await expect(page.locator('.beats-nav')).toBeHidden();
    }

    const closedHeight = await pana.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    await pana.locator('.beat-toggle').click();
    await expect(pana.locator('.beat-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    const panaDetail = pana.locator('.beat-detail');
    const definition = panaDetail.locator('dl');
    await expect(definition).toBeVisible();
    await expect(definition.locator('dt strong')).toHaveText('/pah*nah/');
    await expect(definition.locator('dd ol > li')).toHaveText(DEFINITIONS);
    await expect(definition.locator('dd ol > li > strong')).toHaveCount(4);
    const example = panaDetail.locator('.beat-example');
    await expect(example.locator('strong')).toHaveText(EXAMPLE);
    await example.scrollIntoViewIfNeeded();
    await expect(example).toBeInViewport();
    expect(
      await pana.evaluate((element) => element.getBoundingClientRect().height)
    ).toBe(closedHeight);
    await panaDetail
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(panaDetail).toBeHidden();

    await future.locator('.beat-toggle').click();
    const futureDetail = future.locator('.beat-detail');
    await expect(futureDetail).toBeVisible();
    await expect(
      futureDetail.locator('.beat-detail-body > p > strong')
    ).toHaveText(FUTURE_PARAGRAPHS);
    await expect(futureDetail.locator('.beat-body-question')).toHaveText(
      'What binds us together as a culture and community?'
    );
    await futureDetail
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(cards.locator('.beat-detail:visible')).toHaveCount(0);
  });
}

test('the proposal reuses real details and restores keyboard focus when closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openMock(page);
  const panaToggle = page.locator('.beat-toggle').nth(0);
  const panaDetail = page.locator('#beat-pana');
  await panaToggle.press('Enter');
  await expect(panaDetail).toBeVisible();
  await expect(panaDetail).toBeFocused();
  await expect(panaDetail.locator('.beat-list > li')).toHaveText(
    home.beats.pana.practice.items
  );
  await expect(panaDetail.locator('.beat-numbered > li')).toHaveText(
    DEFINITIONS
  );
  await expect(panaDetail.locator('.beat-example strong')).toHaveText(EXAMPLE);
  await page.keyboard.press('Tab');
  const scrollBody = panaDetail.locator('.beat-detail-body');
  await expect(scrollBody).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => scrollBody.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.keyboard.press('Tab');
  await expect(
    panaDetail.getByRole('button', { name: 'Close', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panaDetail).toBeHidden();
  await expect(panaToggle).toBeFocused();

  await panaToggle.click();
  const futureToggle = page.getByRole('button', {
    name: MORE_LABEL,
    exact: true,
  });
  const futureDetail = page.locator('#beat-future-local');
  await futureToggle.click();
  await expect(panaDetail).toBeVisible();
  await expect(futureDetail).toBeVisible();
  await expect(futureDetail.locator('.beat-list > li')).toHaveText(
    home.beats.local.effects.items
  );
  await futureDetail
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(futureDetail).toBeHidden();
  await expect(futureToggle).toBeFocused();
  await expect(panaDetail).toBeVisible();
  await panaDetail.getByRole('button', { name: 'Close', exact: true }).click();

  const whyToggle = page.locator('.beat-toggle').nth(2);
  const whyDetail = page.locator('#beat-why');
  await whyToggle.click();
  await expect(whyDetail.locator('.beat-detail-body > p')).toHaveText(
    home.beats.why.invitation
  );
  await expect(whyDetail.locator('.beat-tags').nth(0).locator('li')).toHaveText(
    home.beats.why.builds.items
  );
  await expect(whyDetail.locator('.beat-tags').nth(1).locator('li')).toHaveText(
    home.beats.why.values.items
  );
  await page.keyboard.press('Escape');
  await expect(whyDetail).toBeHidden();
  await expect(whyToggle).toBeFocused();
});

test('phone navigation stops at the third card and remains correct after resizing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMock(page);
  const rail = page.locator('.beats');
  const previous = page.getByRole('button', {
    name: 'Previous question',
    exact: true,
  });
  const next = page.getByRole('button', {
    name: 'Next question',
    exact: true,
  });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  await expect(page.locator('.beat-sign').nth(1)).toBeInViewport();
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(300);
  await next.click();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(next).toBeEnabled();
  await previous.click();
  await expect(previous).toBeDisabled();

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.locator('.beats-nav')).toBeHidden();
  await expect
    .poll(() =>
      rail.evaluate((element) => element.scrollWidth - element.clientWidth)
    )
    .toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
});

test('phone disclosures frame their content and close control instead of opening offscreen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMock(page);
  const cards = page.locator('.beats > .beat');
  const next = page.getByRole('button', {
    name: 'Next question',
    exact: true,
  });

  for (let index = 0; index < 3; index += 1) {
    const card = cards.nth(index);
    await card.locator('.beat-toggle').click();
    const panel = card.locator('.beat-detail');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Close' })).toBeInViewport();
    await expect(
      panel.locator('.beat-detail-body > *').first()
    ).toBeInViewport();
    const body = panel.locator('.beat-detail-body');
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(body.locator('li').last()).toBeInViewport();
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(card.locator('.beat-toggle')).toBeFocused();
    if (index < 2) await next.click();
  }
});

test('the density harness retains the same three cards and disclosure state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openMock(page);
  await expect(page.locator('h1').first()).toContainText('The Future');
  const cards = page.locator('.beats > .beat');
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.beat-sign')).toHaveText(CARD_TITLES);
  await expect(page.getByRole('radio', { name: 'Current (4)' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Proposed (3)' })).toHaveCount(
    0
  );
  await cards.nth(0).locator('.beat-toggle').click();
  await page.getByRole('radio', { name: 'Roomy', exact: true }).click();
  await expect(page.locator('#beat-pana')).toBeVisible();
  await expect(cards).toHaveCount(3);
  expect(
    await page
      .locator('.beats')
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(' ').length
      )
  ).toBe(3);

  await page.getByRole('radio', { name: 'Compact', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.beat-sign')).toHaveText(CARD_TITLES);
  await page
    .locator('#beat-pana')
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(page.locator('.beat-detail:visible')).toHaveCount(0);
});

test('Spanish cards translate their complete content and disclosure controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMock(page);
  await page
    .getByRole('banner')
    .locator('button[aria-haspopup="dialog"]')
    .first()
    .click();
  // The mock toolbar can cover the drawer footer; use its keyboard action.
  await page
    .getByRole('button', { name: 'en Español', exact: true })
    .press('Enter');
  const cards = page.locator('.beats > .beat');
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.beat-sign')).toHaveText([
    esHome.beats.pana.question,
    esHome.beats.futureLocal.question,
    esHome.beats.why.question,
  ]);
  await expect(
    page.getByRole('button', { name: 'Pregunta siguiente' })
  ).toBeEnabled();
  await cards.nth(0).locator('.beat-toggle').click();
  const panel = page.locator('#beat-pana');
  await expect(panel.locator('.beat-numbered > li')).toHaveText(
    esHome.beats.pana.definition.items
  );
  await expect(panel.locator('.beat-example strong')).toHaveText(
    esHome.beats.pana.example
  );
  await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(cards.nth(0).locator('.beat-toggle')).toBeFocused();
});

test('the expanded card stays readable above the approved welcome footer on a short phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const response = await page.goto('/mock/welcome-footer#what-is-this', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-welcome-footer-ready]')).toHaveAttribute(
    'data-welcome-footer-ready',
    'true'
  );
  await expect(page.locator('.beats > .beat')).toHaveCount(3);
  await page.locator('.beat-toggle').first().click();
  const panel = page.locator('#beat-pana');
  const body = panel.locator('.beat-detail-body');
  const footer = page.locator('[data-welcome-footer]');
  const bookmark = page.locator('[data-welcome-bookmark]');
  await expect(footer).toBeVisible();
  await expect(bookmark).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Close' })).toBeInViewport();
  await expect
    .poll(async () => {
      const bounds = await body.boundingBox();
      const footerBounds = await footer.boundingBox();
      const bookmarkBounds = await bookmark.boundingBox();
      if (!bounds || !footerBounds || !bookmarkBounds) return false;
      return (
        bounds.y + bounds.height <=
        Math.min(footerBounds.y, bookmarkBounds.y) + 1
      );
    })
    .toBe(true);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(body.locator('li').last()).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('.beat-toggle').first()).toBeFocused();
  await expect(footer).toBeVisible();
});
