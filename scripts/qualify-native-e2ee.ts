import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { nativeQualificationResultSchema } from '../prototypes/e2ee/native-contract';

const platform = z.enum(['android', 'ios']).parse(process.argv[2]);
const deviceId = process.argv[3];
if (!deviceId)
  throw new Error(
    'Provide the explicit isolated qualification emulator/simulator identifier.'
  );
if (process.env.NODE_ENV === 'production')
  throw new Error('Native qualification cannot use production mode.');
const root = fileURLToPath(new URL('../', import.meta.url));
const runId = randomUUID();
const origin = 'http://127.0.0.1:3147';
const processes: ChildProcess[] = [];
let reversed = false;
let launched = false;
const appId =
  platform === 'android'
    ? 'social.pana.app.e2eequalification'
    : 'social.pana.app';
const adb = path.join(
  process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    (process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
      : ''),
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb'
);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function command(program: string, args: string[], timeout = 60_000) {
  return execFileSync(program, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function android(...args: string[]) {
  return command(adb, ['-s', deviceId, ...args]);
}
function ios(...args: string[]) {
  return command(
    'xcrun',
    ['simctl', ...args],
    args[0] === 'launch' ? 180_000 : 60_000
  );
}
function validateDevice() {
  if (platform === 'android') {
    if (
      !/^emulator-\d+$/.test(deviceId) ||
      !android('emu', 'avd', 'name')
        .split('\n')
        .some((name) => name.trim() === 'pana-e2ee-qualification')
    )
      throw new Error(
        'Refusing to clear or launch anything except the explicit pana-e2ee-qualification emulator.'
      );
  } else {
    if (process.platform !== 'darwin')
      throw new Error('iOS qualification requires macOS and Xcode.');
    const data = z
      .object({
        devices: z.record(
          z.string(),
          z.array(
            z.object({
              udid: z.string(),
              name: z.string(),
              state: z.string(),
            })
          )
        ),
      })
      .parse(JSON.parse(ios('list', 'devices', 'booted', '--json')));
    const device = Object.values(data.devices)
      .flat()
      .find((entry) => entry.udid === deviceId);
    if (
      !device ||
      device.name !== 'pana-e2ee-qualification' ||
      device.state !== 'Booted'
    )
      throw new Error(
        'Refusing to launch anything except the explicit booted pana-e2ee-qualification simulator.'
      );
  }
}
async function ensureFree(url: string) {
  let response: Response | null = null;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(1000) });
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof DOMException))
      throw error;
  }
  if (response)
    throw new Error(
      'A qualification port is already in use; do not adopt another session server.'
    );
}
function start(args: string[]) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PANA_E2EE_FIXTURE_RUN: runId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (value: Buffer) => process.stdout.write(value));
  child.stderr?.on('data', (value: Buffer) => process.stderr.write(value));
  processes.push(child);
  return child;
}
async function readJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok)
    throw new Error(
      `Synthetic qualification endpoint failed (${response.status}).`
    );
  return response.json();
}
function healthy() {
  if (
    processes.some(
      (child) => child.exitCode !== null || child.signalCode !== null
    )
  )
    throw new Error('A required local qualification server stopped.');
}
async function ready() {
  const until = Date.now() + 60_000;
  let last: unknown;
  while (Date.now() < until) {
    healthy();
    try {
      const health = z
        .object({ synthetic: z.literal(true), runId: z.uuid() })
        .parse(await readJson(`${origin}/__e2ee/health`));
      if (health.runId !== runId)
        throw new Error('The local API belongs to another qualification run.');
      return;
    } catch (error) {
      last = error;
    }
    await delay(500);
  }
  throw new Error(
    'The isolated native API/WebView harness did not become ready.',
    { cause: last }
  );
}
async function phase(name: 'create' | 'resume' | 'foreground') {
  console.log(`Waiting for actual ${platform}/${name} bridge result.`);
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    healthy();
    const recording = z
      .object({
        runId: z.uuid(),
        results: z.array(nativeQualificationResultSchema),
      })
      .parse(await readJson(`${origin}/__e2ee/native-result/${runId}`));
    if (recording.runId !== runId)
      throw new Error('The native result came from another fixture run.');
    const failed = recording.results.find((entry) => !entry.ok);
    if (failed)
      throw new Error(
        `${failed.platform}/${failed.phase}: ${failed.error ?? 'Native runtime failed.'}`
      );
    const result = recording.results.find((entry) => entry.phase === name);
    if (result) {
      if (
        result.platform !== platform ||
        result.provider !==
          (platform === 'android'
            ? 'android-keystore'
            : 'ios-keychain-this-device-only')
      )
        throw new Error(
          'The result did not use this real native bridge and platform protection.'
        );
      console.log(JSON.stringify(result));
      return;
    }
    await delay(500);
  }
  throw new Error(
    `The real native WebView did not complete its ${name} phase. No runtime qualification is claimed.`
  );
}
function launch() {
  if (platform === 'android')
    android(
      'shell',
      'am',
      'start',
      '-n',
      `${appId}/social.pana.app.MainActivity`
    );
  else ios('launch', deviceId, appId);
  launched = true;
}
function terminate() {
  if (platform === 'android') android('shell', 'am', 'force-stop', appId);
  else ios('terminate', deviceId, appId);
  launched = false;
}
try {
  validateDevice();
  await Promise.all([
    ensureFree(`${origin}/__e2ee/health`),
    ensureFree('http://127.0.0.1:3148/__e2ee/health'),
  ]);
  if (
    platform === 'android' &&
    !android('shell', 'pm', 'clear', appId).includes('Success')
  )
    throw new Error('Could not clear the isolated native fixture app.');
  start([
    '--experimental-test-module-mocks',
    '--import',
    'tsx',
    path.join(root, 'prototypes', 'e2ee', 'api-server.ts'),
  ]);
  start([
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--config',
    path.join(root, 'vite.e2ee.config.ts'),
  ]);
  await ready();
  if (platform === 'android') {
    android('reverse', 'tcp:3147', 'tcp:3147');
    reversed = true;
  }
  launch();
  await phase('create');
  terminate();
  launch();
  await phase('resume');
  if (platform === 'android')
    android('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  else ios('launch', deviceId, 'com.apple.mobilesafari');
  await delay(2000);
  launch();
  await phase('foreground');
  terminate();
  console.log(
    'Real native bridge, cold restart and foreground encrypted-delivery qualification passed. This is not a physical-device result.'
  );
} finally {
  try {
    if (launched) terminate();
  } finally {
    try {
      for (const child of processes) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill();
          await Promise.race([exited, delay(5000)]);
          if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL');
        }
      }
    } finally {
      if (reversed) android('reverse', '--remove', 'tcp:3147');
    }
  }
}
