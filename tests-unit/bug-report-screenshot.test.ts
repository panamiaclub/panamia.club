import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('bug report screenshots allow existing images without forcing the camera', () => {
  const source = readFileSync(
    new URL('../components/BugReportDialog.tsx', import.meta.url),
    'utf8'
  );
  const screenshotInput = [...source.matchAll(/<Input\b[\s\S]*?\/>/g)]
    .map(([input]) => input)
    .find((input) => input.includes('id="bug-report-screenshot"'));

  assert.ok(screenshotInput, 'The screenshot upload input must exist');
  assert.match(screenshotInput, /\btype="file"/);
  assert.match(
    screenshotInput,
    /\baccept="image\/png,image\/jpeg,image\/webp"/
  );
  assert.doesNotMatch(
    screenshotInput,
    /\bcapture\b/,
    'A capture attribute can force mobile users into the camera'
  );
});
