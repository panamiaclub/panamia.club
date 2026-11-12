import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

it('refuses to build or serve the unaudited protocol lab in production', () => {
  for (const command of ['build', 'serve']) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../node_modules/vite/bin/vite.js', import.meta.url)
        ),
        command,
        '--config',
        fileURLToPath(new URL('../vite.e2ee.config.ts', import.meta.url)),
      ],
      {
        env: { ...process.env, NODE_ENV: 'production' },
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    assert.equal(
      result.status,
      1,
      result.error ?? new Error('Production lab startup did not fail closed.')
    );
    assert.match(
      result.stderr + result.stdout,
      /must not be built or served in production/
    );
  }
});
