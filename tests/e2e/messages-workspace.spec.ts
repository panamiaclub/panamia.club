import { expect, test, type Page } from '@playwright/test';
import { DIRECT_THREAD_REFUSED } from '../../lib/dm-refusal';

const conversation = (page: Page) =>
  page.getByRole('region', { name: 'Open conversation' });
const history = (page: Page) => page.getByRole('log');
const row = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Conversations', exact: true })
    .getByRole('button', { name: new RegExp(name) });

test.beforeEach(async ({ page }) => {
  // The layout's session and install metadata are unrelated to this fixture.
  await page.route('**/api/**', (route) => route.fulfill({ json: null }));
  await page.route('**/manifest.webmanifest*', (route) =>
    route.fulfill({
      json: {
        name: 'Messages preview',
        start_url: '/mock/dm-chat',
        display: 'standalone',
      },
    })
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/mock/dm-chat');
  await expect(page).toHaveTitle('Messages workspace (mock) | Pana Social');
  // Wait for the client to open the initial thread at its latest message.
  await expect
    .poll(() => history(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test('keeps the conversation bounded with the composer in view', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: 'Messages.' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back to conversations' })
  ).toBeHidden();
  await expect(
    page.getByRole('textbox', { name: 'Message J. Downs', exact: true })
  ).toBeVisible();
  await expect
    .poll(() =>
      history(page).evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThan(3);
  const box = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThan(960);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight)
  ).toBeLessThanOrEqual(960);
});

test('preserves independent text and GIF drafts when switching conversations', async ({
  page,
}) => {
  const input = page.getByRole('textbox', {
    name: 'Message J. Downs',
    exact: true,
  });
  await input.fill('Saturday works for me.');
  await input.press('Shift+Enter');
  await input.pressSequentially('I will bring coffee.');
  await page.getByRole('button', { name: 'Add a GIF' }).click();
  await page
    .getByRole('button', { name: 'Choose A little celebration GIF' })
    .click();
  await row(page, 'G. Barrios').click();
  await expect(
    page.getByRole('textbox', { name: 'Message G. Barrios', exact: true })
  ).toHaveValue('');
  await page
    .getByRole('textbox', { name: 'Message G. Barrios', exact: true })
    .fill('Another draft');
  await row(page, 'J. Downs').click();
  await expect(input).toHaveValue(
    'Saturday works for me.\nI will bring coffee.'
  );
  await expect(page.getByRole('button', { name: 'Remove GIF' })).toBeVisible();
  await expect(row(page, 'G. Barrios')).toContainText('Draft: Another draft');
});

test('retains failed sends, retries without duplicates, and never posts a real message', async ({
  page,
}) => {
  const messagingRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/social\/(statuses|messages|dm-requests)/.test(request.url())) {
      messagingRequests.push(request.url());
    }
  });
  await page
    .getByRole('button', { name: 'Fail next send', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Message J. Downs', exact: true })
    .fill('Keep this exact message.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toBeVisible();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toBeVisible();
  await row(page, 'G. Barrios').click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toHaveCount(0);
  await row(page, 'J. Downs').click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    conversation(page).getByText('Not sent', { exact: true })
  ).toHaveCount(0);
  await expect(
    conversation(page).getByText('Sending', { exact: true })
  ).toHaveCount(0);
  await expect(
    history(page).getByText('Keep this exact message.', { exact: true })
  ).toHaveCount(1);
  expect(messagingRequests).toEqual([]);
});

test('does not pull the reader down when a sample message arrives', async ({
  page,
}) => {
  await history(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(
    page.getByRole('button', { name: 'Back to latest', exact: true })
  ).toBeVisible();
  const before = await history(page).evaluate((element) => element.scrollTop);
  await page.getByRole('button', { name: 'Receive a sample message' }).click();
  await expect(
    page.getByRole('button', { name: '1 new message', exact: true })
  ).toBeVisible();
  expect(await history(page).evaluate((element) => element.scrollTop)).toBe(
    before
  );
  await page
    .getByRole('button', { name: '1 new message', exact: true })
    .click();
  await expect
    .poll(() =>
      history(page).evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThan(3);
});

test('opens a new conversation and filters people separately from existing chats', async ({
  page,
}) => {
  await page
    .getByRole('searchbox', { name: 'Find a conversation by name or handle' })
    .fill('no matching person');
  await expect(page.getByText('No matching conversations.')).toBeVisible();
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('searchbox', { name: 'Find a pana' })
  ).toBeFocused();
  await dialog.getByRole('searchbox', { name: 'Find a pana' }).fill('@sofim');
  await dialog.getByRole('button', { name: /Sofia Morales/ }).click();
  await expect(
    conversation(page).getByText('Say a little hello.', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Message Sofia Morales', exact: true })
  ).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Message Sofia Morales', exact: true })
    .fill('Hola Sofia!');
  await page
    .getByRole('textbox', { name: 'Message Sofia Morales', exact: true })
    .press('Enter');
  await expect(
    history(page).getByText('Hola Sofia!', { exact: true })
  ).toBeVisible();
});

test('lets requests be accepted or deleted, with remote and refused states intact', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Requests (1)', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept request', exact: true })
  ).toBeVisible();
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Accept request', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Message Anette Mago', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Requests (0)', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await page.getByRole('button', { name: 'Requests (1)', exact: true }).click();
  await page
    .getByRole('button', { name: 'Delete request', exact: true })
    .click();
  await expect(
    page.getByText('No message requests waiting for you.')
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Message folders' })
    .getByRole('button', { name: 'Messages', exact: true })
    .click();
  await row(page, 'Mart Ruiz').click();
  await expect(
    conversation(page).getByText('On indieweb.social.')
  ).toBeVisible();
  await row(page, 'R. Nieves').click();
  await expect(
    conversation(page).getByText(DIRECT_THREAD_REFUSED, { exact: true })
  ).toBeVisible();
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
});

test('uses list/detail navigation on mobile and fits a shortened viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('complementary', { name: 'Your messages' })
  ).toBeVisible();
  await expect(conversation(page)).toBeHidden();
  await row(page, 'J. Downs').click();
  await expect(
    page.getByRole('complementary', { name: 'Your messages' })
  ).toBeHidden();
  await expect(conversation(page)).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Message J. Downs', exact: true })
    .fill('My mobile draft');
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(row(page, 'J. Downs')).toBeFocused();
  await row(page, 'J. Downs').click();
  await expect(
    page.getByRole('textbox', { name: 'Message J. Downs', exact: true })
  ).toHaveValue('My mobile draft');
  await page.setViewportSize({ width: 390, height: 520 });
  const box = await page
    .getByRole('button', { name: 'Send message', exact: true })
    .boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThan(520);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});
