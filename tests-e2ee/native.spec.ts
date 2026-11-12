import { test, expect } from '@playwright/test';
import { nativeQualificationResultSchema } from '../prototypes/e2ee/native-contract';

test('native qualification refuses a normal browser instead of claiming protected native storage', async ({
  page,
  request,
}) => {
  test.skip(
    !test.info().project.name.startsWith('openmls-'),
    'The product qualification projects cover this native boundary.'
  );
  await request.post('/__e2ee/reset');
  const { runId } = await (await request.get('/__e2ee/health')).json();
  await page.goto('/native.html?platform=android');
  await expect(page.locator('#error')).toContainText(
    'requires a real Capacitor WebView'
  );
  await expect
    .poll(async () => {
      const body = await (
        await request.get(`/__e2ee/native-result/${runId}`)
      ).json();
      return body.results.length;
    })
    .toBe(1);
  const recording = await (
    await request.get(`/__e2ee/native-result/${runId}`)
  ).json();
  const result = nativeQualificationResultSchema.parse(recording.results[0]);
  expect(result.ok).toBe(false);
  expect(result.provider).toBeUndefined();
  const audit = (await (await request.get('/__e2ee/audit')).json()) as Array<{
    path: string;
  }>;
  expect(
    audit.some((entry) => entry.path.startsWith('/api/social/encryption/'))
  ).toBe(false);
});
