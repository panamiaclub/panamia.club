import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const source = 'a'.repeat(40);
const origin = 'https://staging.panamia.club';
const resources = {
  version: 1,
  environment: 'staging',
  worker: 'panamia-staging',
  accountId: '99a70a6ec57b862e51035de6fd126cea',
  origin,
  databaseProjectRef: 's'.repeat(20),
  productionDatabaseProjectRef: 'p'.repeat(20),
  kvNamespaceId: 'b'.repeat(32),
  publicBucket: 'panamia-staging-media',
  privateBucket: 'panamia-staging-chat-private',
};

async function runOperator(mode, scenario = {}) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'hosted-staging-operator-test-')
  );
  const filename = path.join(directory, 'resources.json');
  const fixture = path.join(directory, 'operator.mjs');
  const marker = {
    version: 1,
    environment: 'staging',
    worker: resources.worker,
    origin,
    databaseProjectRef: resources.databaseProjectRef,
    sourceCommit: source,
    allowedUserIds: ['00000000-0000-4000-8000-000000000001'],
    access: mode === 'pause' ? 'ready' : 'paused',
  };
  const command = path.resolve('scripts', 'hosted-staging.ts');
  const script = `
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    import { promisify } from 'node:util';
    import { pathToFileURL } from 'node:url';
    const resources = ${JSON.stringify(resources)};
    const marker = ${JSON.stringify(marker)};
    const scenario = ${JSON.stringify(scenario)};
    const report = { updates: 0, probes: 0, access: marker.access };
    const execFile = () => { throw new Error('Unexpected subprocess'); };
    execFile[promisify.custom] = async (command, args) => {
      assert.equal(command, 'git');
      if (args[0] === 'status') return { stdout: '', stderr: '' };
      assert.deepEqual(args, ['rev-parse', 'HEAD']);
      return { stdout: (scenario.localSource ?? marker.sourceCommit) + '\\n', stderr: '' };
    };
    mock.module('node:child_process', { namedExports: { execFile } });
    mock.module(${JSON.stringify(import.meta.resolve('postgres'))}, { defaultExport: () => {
      const sql = async (strings, ...values) => {
        const query = strings.join('?');
        assert.ok(query.includes('pana_staging.environment'));
        if (query.includes('SELECT resource, descriptor')) return [{ resource: resources, descriptor: marker }];
        assert.ok(query.includes('jsonb_set'));
        assert.ok(query.includes('AND resource ='));
        assert.ok(query.includes('AND descriptor ='));
        assert.deepEqual(JSON.parse(values[1]), resources);
        assert.deepEqual(JSON.parse(values[2]), marker);
        report.updates++;
        if (scenario.concurrentChange) return [];
        report.access = values[0];
        return [{ id: 1 }];
      };
      sql.end = async () => console.log('OPERATOR_RESULT:' + JSON.stringify(report));
      return sql;
    } });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, resources.origin + '/__staging/health');
      assert.equal(options.redirect, 'error');
      report.probes++;
      return Response.json({
        environment: 'staging', sourceCommit: scenario.healthSource ?? marker.sourceCommit, access: marker.access
      });
    };
    process.argv = [process.execPath, ${JSON.stringify(command)}, ${JSON.stringify(mode)}, '--resources', ${JSON.stringify(filename)}];
    await import(pathToFileURL(${JSON.stringify(command)}).href);
  `;
  try {
    await writeFile(filename, JSON.stringify(resources));
    await writeFile(fixture, script);
    const result = spawnSync(
      process.execPath,
      ['--experimental-test-module-mocks', '--import', 'tsx', fixture],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STAGING_POSTGRES_URL: `postgres://postgres:synthetic-password@db.${resources.databaseProjectRef}.supabase.co:5432/postgres`,
          STAGING_BETTER_AUTH_SECRET: 'synthetic-only-'.repeat(4),
        },
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    const report = result.stdout.match(/OPERATOR_RESULT:([^\n]+)/);
    assert.ok(report, result.stderr);
    return {
      status: result.status,
      stderr: result.stderr,
      report: JSON.parse(report[1]),
    };
  } finally {
    await rm(directory, { recursive: true });
  }
}

test('operator pause changes only the owned admission marker, without a build or network probe', async () => {
  const result = await runOperator('pause');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report, { updates: 1, probes: 0, access: 'paused' });
});

test('operator resume requires healthy current source before its compare-and-swap update', async () => {
  const result = await runOperator('resume');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report, { updates: 1, probes: 1, access: 'ready' });
});

test('operator cannot resume a different checkout or a stale deployment', async () => {
  for (const scenario of [
    { localSource: 'b'.repeat(40) },
    { healthSource: 'b'.repeat(40) },
  ]) {
    const result = await runOperator('resume', scenario);
    assert.equal(result.status, 1);
    assert.equal(result.report.updates, 0);
    assert.equal(result.report.access, 'paused');
  }
});

test('operator access update rejects a concurrently changed registry or marker', async () => {
  const result = await runOperator('resume', { concurrentChange: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /marker changed/);
  assert.equal(result.report.access, 'paused');
});
