import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import postgres from 'postgres';
import { z } from 'zod';
import {
  assertStagingDatabase,
  assertStagingDirectory,
  isolatedProcessEnv,
  isolatedWorkerConfig,
  readStagingState,
  type StagingState,
} from './e2ee-staging-config';
import { createStagingSnapshot } from './staging-snapshot';
import {
  connectStaging,
  seedStaging,
  stagingSignInUrl,
} from '../tests-staging/fixtures';

const exec = promisify(execFile);
const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const executable = (name: string) =>
  `${name}${process.platform === 'win32' ? '.exe' : ''}`;

function redact(text: string, state: StagingState) {
  const password = new URL(state.databaseUrl).password;
  for (const secret of [state.databaseUrl, password, state.authSecret]) {
    text = text.replaceAll(secret, '[pilot-secret]');
  }
  return text
    .replace(/([?&]token=)[^&\s"'<>]+/g, '$1[redacted]')
    .replace(
      /(^|[^A-Za-z0-9+/])[A-Za-z0-9+/]{43}=(?=$|[^A-Za-z0-9+/=])/g,
      '$1[key-redacted]'
    );
}

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Cannot reserve a loopback pilot port.');
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function command(
  program: string,
  args: string[],
  state: StagingState,
  extraEnv: Partial<NodeJS.ProcessEnv> = {},
  cwd = state.directory
) {
  try {
    return await exec(program, args, {
      cwd,
      env: { ...isolatedProcessEnv(state), ...extraEnv },
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const output = [detail];
    if (typeof error === 'object' && error !== null) {
      if ('stdout' in error && typeof error.stdout === 'string') {
        output.push(error.stdout);
      }
      if ('stderr' in error && typeof error.stderr === 'string') {
        output.push(error.stderr);
      }
    }
    throw new Error(
      redact(`Pilot command failed: ${output.join('\n')}`, state)
    );
  }
}

async function nodeBin(snapshot: string, name: string, commandName: string) {
  const directory = path.join(snapshot, 'node_modules', ...name.split('/'));
  const pkg: unknown = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8')
  );
  const meta = z
    .object({ bin: z.union([z.string(), z.record(z.string(), z.string())]) })
    .parse(pkg);
  const relative =
    typeof meta.bin === 'string' ? meta.bin : meta.bin[commandName];
  if (!relative) throw new Error(`Missing installed ${commandName} command.`);
  return path.resolve(directory, relative);
}

function child(
  program: string,
  args: string[],
  state: StagingState,
  logName: string,
  cwd: string,
  extraEnv: Partial<NodeJS.ProcessEnv> = {}
) {
  const process = spawn(program, args, {
    cwd,
    env: { ...isolatedProcessEnv(state), ...extraEnv },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  for (const stream of [process.stdout, process.stderr]) {
    stream?.on('data', (data: Buffer) => {
      log += redact(data.toString('utf8'), state);
    });
  }
  process.on('error', (error) => {
    log += `\n${redact(error.message, state)}\n`;
  });
  return {
    process,
    async saveLog() {
      await writeFile(path.join(state.directory, logName), log, {
        mode: 0o600,
      });
    },
    tail: () => log.slice(-4000),
  };
}

async function stopChild(process: ChildProcess) {
  if (process.exitCode !== null || !process.pid) return;
  if (globalThis.process.platform === 'win32') {
    await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `function Stop-OwnedTree([int]$OwnerId) {
          $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $OwnerId";
          foreach ($child in $children) { Stop-OwnedTree ([int]$child.ProcessId) };
          if (Get-Process -Id $OwnerId -ErrorAction SilentlyContinue) {
            Stop-Process -Id $OwnerId -ErrorAction Stop
          }
        }; Stop-OwnedTree ${process.pid}`,
      ],
      { windowsHide: true }
    );
  } else {
    process.kill('SIGTERM');
  }
  if (process.exitCode !== null) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      once(process, 'exit'),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('An owned pilot child did not stop.')),
          15_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function startDatabase(state: StagingState) {
  const url = assertStagingDatabase(state.databaseUrl);
  const handle = child(
    path.join(state.postgresBin, executable('postgres')),
    [
      '-D',
      path.join(state.directory, 'postgres'),
      '-h',
      '127.0.0.1',
      '-p',
      url.port,
      '-c',
      'max_connections=40',
      '-c',
      'shared_buffers=64MB',
      // Every client uses TCP; never create sockets in a shared system directory.
      '-c',
      'unix_socket_directories=',
      '-c',
      'log_statement=none',
      '-c',
      'log_min_error_statement=panic',
      '-c',
      'log_parameter_max_length_on_error=0',
    ],
    state,
    'postgres.log',
    state.directory
  );
  const deadline = Date.now() + 60_000;
  try {
    while (Date.now() < deadline) {
      if (handle.process.exitCode !== null) {
        throw new Error(`Pilot PostgreSQL exited:\n${handle.tail()}`);
      }
      const ready = await exec(
        path.join(state.postgresBin, executable('pg_isready')),
        [
          '-h',
          '127.0.0.1',
          '-p',
          url.port,
          '-U',
          url.username,
          '-d',
          'postgres',
        ],
        { windowsHide: true, env: isolatedProcessEnv(state) }
      ).then(
        () => true,
        (error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            [1, 2].includes(Number(error.code))
          )
            return false;
          throw error;
        }
      );
      if (ready) return handle;
      await pause(250);
    }
    throw new Error('Pilot PostgreSQL did not become ready.');
  } catch (error) {
    await stopChild(handle.process);
    await handle.saveLog();
    throw error;
  }
}

async function stopDatabase(
  state: StagingState,
  handle: Awaited<ReturnType<typeof startDatabase>>
) {
  if (handle.process.exitCode === null) {
    await command(
      path.join(state.postgresBin, executable('pg_ctl')),
      [
        '-D',
        path.join(state.directory, 'postgres'),
        'stop',
        '-m',
        'fast',
        '-w',
      ],
      state
    );
  }
  await handle.saveLog();
}

async function snapshotSource(state: StagingState) {
  const config = isolatedWorkerConfig(
    await readFile(path.join(repository, 'wrangler.jsonc'), 'utf8'),
    state
  );
  return createStagingSnapshot(repository, state.directory, config);
}

async function setup(directory: string, postgresBin: string) {
  const runId = randomUUID();
  const id = runId.replaceAll('-', '').slice(0, 12);
  const port = await unusedPort();
  let appPort = await unusedPort();
  while (appPort === port) appPort = await unusedPort();
  const { stdout: commit } = await exec('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    windowsHide: true,
  });
  const { stdout: dirty } = await exec('git', ['status', '--porcelain'], {
    cwd: repository,
    windowsHide: true,
  });
  const state: StagingState = {
    version: 1,
    runId,
    directory,
    postgresBin: path.resolve(postgresBin),
    sourceCommit: commit.trim(),
    sourceDirty: Boolean(dirty.trim()),
    origin: `http://127.0.0.1:${appPort}`,
    databaseUrl: `postgres://pana_stage_owner:${randomBytes(32).toString('base64url')}@127.0.0.1:${port}/pana_e2ee_stage_${id}`,
    authSecret: randomBytes(32).toString('base64url'),
    accounts: {},
    groups: {},
  };
  await mkdir(directory);
  await mkdir(path.join(directory, 'home'));
  await writeFile(
    path.join(directory, 'pilot.json'),
    JSON.stringify(state, null, 2),
    { mode: 0o600 }
  );
  const passwordFile = path.join(directory, 'initdb-password');
  await writeFile(passwordFile, new URL(state.databaseUrl).password, {
    mode: 0o600,
  });
  const version = await command(
    path.join(state.postgresBin, executable('postgres')),
    ['--version'],
    state
  );
  if (!/\b16\.\d+/.test(version.stdout)) {
    throw new Error('This pilot is qualified with PostgreSQL 16 binaries.');
  }
  await command(
    path.join(state.postgresBin, executable('initdb')),
    [
      '-D',
      path.join(directory, 'postgres'),
      '--username=pana_stage_owner',
      '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
      `--pwfile=${passwordFile}`,
    ],
    state
  );
  await unlink(passwordFile);
  const database = await startDatabase(state);
  try {
    const url = assertStagingDatabase(state.databaseUrl);
    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';
    const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
    try {
      await admin.unsafe(`CREATE DATABASE "${url.pathname.slice(1)}"`);
    } finally {
      await admin.end({ timeout: 5 });
    }
    const sql = postgres(state.databaseUrl, { max: 1, prepare: false });
    try {
      await sql.unsafe(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations
          (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT);
        CREATE SCHEMA pana_e2ee_pilot;
        CREATE TABLE pana_e2ee_pilot.owner (run_id UUID PRIMARY KEY);
      `);
      await sql`INSERT INTO pana_e2ee_pilot.owner (run_id) VALUES (${runId})`;
      const journal = z
        .object({
          entries: z.array(
            z.object({
              idx: z.number(),
              tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
              when: z.number(),
            })
          ),
        })
        .parse(
          JSON.parse(
            await readFile(
              path.join(repository, 'drizzle', 'meta', '_journal.json'),
              'utf8'
            )
          )
        );
      const snapshot = await snapshotSource(state);
      for (const entry of journal.entries) {
        const file = path.join(snapshot, 'drizzle', `${entry.tag}.sql`);
        await command(
          path.join(state.postgresBin, executable('psql')),
          [
            '-X',
            '--no-password',
            '--quiet',
            '-h',
            '127.0.0.1',
            '-p',
            url.port,
            '-U',
            url.username,
            '-d',
            url.pathname.slice(1),
            '--set=ON_ERROR_STOP=1',
            '--file',
            file,
          ],
          state,
          { PGPASSWORD: url.password }
        );
        const hash = createHash('sha256')
          .update(await readFile(file))
          .digest('hex');
        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${entry.when})
        `;
      }
      await seedStaging(sql, state);
      await writeFile(
        path.join(directory, 'pilot.json'),
        JSON.stringify(state, null, 2),
        { mode: 0o600 }
      );
      const build = child(
        process.execPath,
        [await nodeBin(snapshot, 'vinext', 'vinext'), 'build'],
        state,
        'build.log',
        snapshot
      );
      const [code] = await once(build.process, 'exit');
      await build.saveLog();
      if (code !== 0)
        throw new Error(`Pilot app build failed:\n${build.tail()}`);
      console.log(
        `Isolated pilot prepared at ${state.origin}; ${journal.entries.length} migrations applied.`
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    await stopDatabase(state, database);
  }
}

async function withServices(state: StagingState, action: () => Promise<void>) {
  const database = await startDatabase(state);
  let worker: ReturnType<typeof child> | undefined;
  let primaryError: unknown;
  try {
    const sql = await connectStaging(state);
    await sql.end({ timeout: 5 });
    const snapshot = path.join(state.directory, 'app');
    worker = child(
      process.execPath,
      [
        await nodeBin(snapshot, 'wrangler', 'wrangler'),
        'dev',
        '--local',
        '--ip',
        '127.0.0.1',
        '--port',
        new URL(state.origin).port,
        '--config',
        path.join(snapshot, 'dist', 'server', 'wrangler.json'),
        '--persist-to',
        path.join(state.directory, 'worker-state'),
        '--log-level',
        'warn',
      ],
      state,
      'worker.log',
      snapshot
    );
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (worker.process.exitCode !== null) {
        throw new Error(`Pilot Worker exited:\n${worker.tail()}`);
      }
      try {
        const response = await fetch(`${state.origin}/api/auth/get-session`, {
          signal: AbortSignal.timeout(3000),
          redirect: 'manual',
        });
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch (error) {
        if (
          !(error instanceof Error) ||
          (error.name !== 'TimeoutError' &&
            !(
              error.cause instanceof Error &&
              'code' in error.cause &&
              ['ECONNREFUSED', 'ECONNRESET'].includes(String(error.cause.code))
            ))
        )
          throw error;
      }
      await pause(500);
    }
    if (!ready) throw new Error(`Pilot Worker is not ready:\n${worker.tail()}`);
    console.log(
      `Real Worker, auth and PostgreSQL are ready at ${state.origin}.`
    );
    const unexpectedExit = (process: ChildProcess, name: string) => {
      if (process.exitCode !== null) {
        return Promise.reject(new Error(`The pilot ${name} already exited.`));
      }
      return once(process, 'exit').then(() => {
        throw new Error(`The pilot ${name} exited while it was in use.`);
      });
    };
    await Promise.race([
      action(),
      unexpectedExit(worker.process, 'Worker'),
      unexpectedExit(database.process, 'database'),
    ]);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    const runner = worker;
    const cleanup = [
      ...(runner
        ? [() => stopChild(runner.process), () => runner.saveLog()]
        : []),
      () => stopDatabase(state, database),
    ];
    for (const operation of cleanup) {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
        'Pilot cleanup failed; earlier errors are retained.'
      );
    }
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      directory: { type: 'string' },
      'postgres-bin': { type: 'string' },
      account: { type: 'string' },
    },
  });
  const usage =
    'Usage: node --import tsx scripts\\e2ee-staging.ts setup|serve|check|login --directory <absolute e2ee-staging-id> [--postgres-bin <PG16 bin>] [--account demo-alice]';
  if (!values.directory) throw new Error(usage);
  const directory = assertStagingDirectory(values.directory, repository);
  const mode = positionals[0];
  if (mode === 'setup') {
    if (!values['postgres-bin']) throw new Error(usage);
    await setup(directory, values['postgres-bin']);
    return;
  }
  const state = await readStagingState(directory);
  if (mode === 'login') {
    console.log(await stagingSignInUrl(state, values.account ?? 'demo-alice'));
  } else if (mode === 'serve') {
    await withServices(state, async () => {
      console.log('Synthetic test accounts only. Production is unchanged.');
      await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]);
    });
  } else if (mode === 'check') {
    const report = path.join(state.directory, 'pilot-results.json');
    await rm(report, { force: true });
    try {
      await withServices(state, async () => {
        const browserPath =
          process.env.PLAYWRIGHT_BROWSERS_PATH ??
          path.join(
            process.platform === 'win32'
              ? (process.env.LOCALAPPDATA ?? os.homedir())
              : (process.env.XDG_CACHE_HOME ??
                  path.join(os.homedir(), '.cache')),
            'ms-playwright'
          );
        const result = await command(
          process.execPath,
          [
            await nodeBin(repository, '@playwright/test', 'playwright'),
            'test',
            '--config',
            path.join(repository, 'playwright.encrypted-staging.config.ts'),
          ],
          state,
          {
            PANA_E2EE_STAGING_DIRECTORY: directory,
            PLAYWRIGHT_BROWSERS_PATH: browserPath,
          },
          repository
        );
        console.log(result.stdout);
      });
    } catch (error) {
      try {
        await rm(report, { force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Pilot check failed and its unverified report could not be removed.'
        );
      }
      throw error;
    }
  } else {
    throw new Error(usage);
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
