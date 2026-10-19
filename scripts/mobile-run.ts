/**
 * Builds, installs, and launches the Android app on an emulator or a connected
 * device.
 *
 * This exists instead of a plain `cap run android` for two reasons.
 *
 * The first is environment discovery. The Android toolchain is found through
 * environment variables that nothing sets for you: Gradle needs `JAVA_HOME`,
 * and `adb` is found through `ANDROID_HOME`. Android Studio sets them for its
 * own child processes and the command-line tools do not set them at all, so on
 * a fresh shell the tooling fails with an error about a missing SDK on a
 * machine where the SDK is installed and working. The documented alternative
 * was a four-line `$env:` preamble pasted into every new terminal, which is
 * exactly the kind of instruction that goes stale and gets mistyped.
 *
 * The second is that `cap run android` is broken on Windows. Capacitor invokes
 * the wrapper as the hardcoded POSIX path `'./gradlew'`, and the argument
 * masking in `@ionic/utils-subprocess` strips only `path.sep` — which is `\`
 * on Windows. The `./` therefore survives into `cross-spawn` and the build dies
 * with `'gradlew' is not recognized`. Driving Gradle and `adb` directly is a
 * few more lines than delegating, and it is the difference between a command
 * that works on every contributor's machine and one that works on some.
 *
 *   yarn mobile:run:android                     # build, install, launch
 *   yarn mobile:run:android --avd Pixel_7       # pick a specific emulator
 *   yarn mobile:run:android --no-sync           # skip the config copy
 *
 * iOS deliberately has no equivalent. `cap run ios` needs Xcode, Xcode can only
 * live in one place and puts its own tooling on `PATH`, and none of the above
 * applies to it.
 */

import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import { MOBILE_APP_ID } from '../lib/mobile/app-identity';

const require = createRequire(import.meta.url);

const IS_WINDOWS = platform() === 'win32';
const IS_MAC = platform() === 'darwin';

/**
 * The minimum JDK the Android Gradle Plugin accepts. Below this the build fails
 * deep inside Gradle with a message about class file versions that gives no
 * hint that the JDK is the problem, which is worth catching here instead.
 */
const MINIMUM_JDK = 17;

/** How long to wait for a cold emulator to finish booting. */
const EMULATOR_BOOT_TIMEOUT_MS = 180_000;

const ANDROID_DIR = join('mobile', 'android');
const APK = join(
  ANDROID_DIR,
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

function firstExisting(candidates: (string | undefined)[]): string | undefined {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

/**
 * Locates the Android SDK.
 *
 * `ANDROID_HOME` is the modern name and `ANDROID_SDK_ROOT` the deprecated one,
 * but plenty of machines still only have the latter, so both are honoured
 * before falling back to the per-platform default install location.
 */
function findAndroidSdk(): string | undefined {
  const defaults = IS_WINDOWS
    ? [
        join(
          process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
          'Android',
          'Sdk'
        ),
      ]
    : IS_MAC
      ? [join(homedir(), 'Library', 'Android', 'sdk')]
      : [join(homedir(), 'Android', 'Sdk'), '/usr/lib/android-sdk'];

  return firstExisting([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    ...defaults,
  ]);
}

/** A directory is a usable JDK if it can actually run `java`. */
function isJdk(dir: string): boolean {
  return existsSync(join(dir, 'bin', IS_WINDOWS ? 'java.exe' : 'java'));
}

/**
 * Pulls the major version out of a JDK directory name — `jdk-21.0.12.101-hotspot`
 * and `temurin-17.jdk` both yield a number.
 *
 * Sorting these numerically matters: a plain string sort puts `jdk-8` above
 * `jdk-21`, which would hand Gradle a JDK old enough to fail the build on a
 * machine that also has a perfectly good one installed.
 */
function majorVersion(name: string): number {
  const match = name.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

/**
 * Locates a JDK, preferring the newest that meets MINIMUM_JDK.
 *
 * Android Studio's bundled runtime is checked as well as standalone installs,
 * because it is the JDK most contributors will already have without having
 * chosen to install one — and it is always a supported version, since Studio
 * ships the JDK its own Gradle needs.
 */
function findJdk(): string | undefined {
  if (process.env.JAVA_HOME && isJdk(process.env.JAVA_HOME))
    return process.env.JAVA_HOME;

  /* Android Studio's bundled JDK, at its default install path. */
  const bundled = IS_WINDOWS
    ? [
        'C:\\Program Files\\Android\\Android Studio\\jbr',
        'C:\\Program Files\\Android\\Android Studio\\jre',
      ]
    : IS_MAC
      ? [
          '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
          '/Applications/Android Studio.app/Contents/jre/Contents/Home',
        ]
      : ['/opt/android-studio/jbr', '/opt/android-studio/jre'];

  const fromStudio = bundled.find(isJdk);
  if (fromStudio) return fromStudio;

  /* Directories that hold many JDKs side by side. Each entry is a candidate,
   * and on macOS the JDK root is nested under Contents/Home. */
  const searchRoots = IS_WINDOWS
    ? [
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Microsoft',
      ]
    : IS_MAC
      ? ['/Library/Java/JavaVirtualMachines']
      : ['/usr/lib/jvm'];

  const found: { path: string; version: number }[] = [];

  for (const root of searchRoots) {
    if (!existsSync(root)) continue;

    for (const entry of readdirSync(root)) {
      const candidates = [
        join(root, entry),
        join(root, entry, 'Contents', 'Home'),
      ];
      const jdk = candidates.find(isJdk);
      if (jdk) found.push({ path: jdk, version: majorVersion(entry) });
    }
  }

  return found
    .sort((a, b) => b.version - a.version)
    .find((jdk) => jdk.version >= MINIMUM_JDK)?.path;
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const androidSdk =
  findAndroidSdk() ??
  fail(
    [
      'Could not find the Android SDK.',
      '',
      'Install it with Android Studio, or with the command-line tools alone:',
      '  https://developer.android.com/studio#command-line-tools-only',
      '',
      'If it is already installed somewhere non-standard, point ANDROID_HOME at it.',
      'See docs/MOBILE-ROADMAP.md for the full setup.',
    ].join('\n')
  );

const javaHome =
  findJdk() ??
  fail(
    [
      `Could not find a JDK ${MINIMUM_JDK} or newer, which Gradle needs to build the app.`,
      '',
      'Install one:',
      IS_WINDOWS
        ? '  winget install EclipseAdoptium.Temurin.21.JDK'
        : IS_MAC
          ? '  brew install --cask temurin@21'
          : '  sudo apt install openjdk-21-jdk',
      '',
      'Android Studio also bundles a suitable JDK, and installing it is enough.',
      'If you already have one, point JAVA_HOME at it.',
    ].join('\n')
  );

console.log(`JDK          ${javaHome}`);
console.log(`Android SDK  ${androidSdk}\n`);

/* `platform-tools` carries adb. Putting it on PATH alongside the JDK means
 * every child process below finds its tools the same way, rather than each one
 * needing an absolute path. */
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidSdk,
  PATH: [
    join(androidSdk, 'platform-tools'),
    join(javaHome, 'bin'),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(IS_WINDOWS ? ';' : ':'),
};

const exe = (name: string) => (IS_WINDOWS ? `${name}.exe` : name);
const adb = join(androidSdk, 'platform-tools', exe('adb'));

function run(command: string, args: string[], cwd?: string): void {
  execFileSync(command, args, { stdio: 'inherit', env, cwd });
}

function capture(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', env }).trim();
}

/* Synchronous sleep. This script is a straight line of blocking steps, and
 * Atomics.wait on a throwaway buffer is the standard way to pause one without
 * restructuring it around async. */
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Last non-empty lines of a log, for including in a startup error. */
function tail(path: string, lines: number): string {
  try {
    return (
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .slice(-lines)
        .join('\n') || '(no output)'
    );
  } catch {
    return '(no output)';
  }
}

/** Serial numbers of everything `adb` currently considers usable. */
function attachedDevices(): string[] {
  return capture(adb, ['devices'])
    .split('\n')
    .slice(1) // "List of devices attached"
    .map((line) => line.split('\t'))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
}

/**
 * Boots an emulator and waits for it to finish starting.
 *
 * Worth doing rather than telling the caller to go and start one: it is the
 * slowest and most forgettable step, and `adb` reports a booting emulator as
 * `device` long before Android is ready to accept an install — so the naive
 * version fails intermittently in a way that looks like a broken build.
 * `sys.boot_completed` is the property that actually means ready.
 */
function startEmulator(preferred?: string): void {
  const emulatorBin = join(androidSdk, 'emulator', exe('emulator'));
  if (!existsSync(emulatorBin)) {
    fail(
      [
        'No device is attached and the emulator is not installed.',
        '',
        'Install it and create a device:',
        '  android sdk install emulator',
        '  android emulator create medium_phone',
      ].join('\n')
    );
  }

  const avds = capture(emulatorBin, ['-list-avds']).split('\n').filter(Boolean);
  if (!avds.length) {
    fail(
      [
        'No device is attached and no emulator is set up.',
        '',
        'Create one, then run this again:',
        '  android emulator create medium_phone',
      ].join('\n')
    );
  }

  const avd = preferred ?? avds[0];
  if (preferred && !avds.includes(preferred)) {
    fail(`No emulator named ${preferred}. Available: ${avds.join(', ')}`);
  }

  console.log(`Starting emulator ${avd}...`);

  /* A file descriptor, rather than a pipe, lets the detached emulator outlive
   * this script without keeping an IPC channel open. */
  const logPath = join(tmpdir(), `emulator-${avd}.log`);
  const log = openSync(logPath, 'w');

  /* Detached and unref'd because the emulator outlives this script on purpose:
   * the next run should find it already up rather than pay the boot cost again.
   * `-no-snapshot-load` avoids stale quickboot snapshots left by upgrades or
   * interrupted hosts; the reliable cold boot is worth the extra startup time. */
  try {
    spawn(emulatorBin, ['-avd', avd, '-no-snapshot-load'], {
      detached: true,
      stdio: ['ignore', log, log],
      env,
    }).unref();
  } finally {
    /* spawn duplicates/inherits the descriptor for the child on every supported
     * platform, so the parent must release its copy while it waits for boot. */
    closeSync(log);
  }

  const deadline = Date.now() + EMULATOR_BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if (capture(adb, ['shell', 'getprop', 'sys.boot_completed']) === '1') {
        console.log('Emulator ready.\n');
        return;
      }
    } catch {
      /* adb exits non-zero until the device appears at all. Expected while
       * booting, and not worth distinguishing from "booted but not ready". */
    }
    sleep(2000);
  }

  fail(
    [
      `Emulator ${avd} did not finish booting within ${EMULATOR_BOOT_TIMEOUT_MS / 1000}s.`,
      '',
      'Last output from the emulator:',
      tail(logPath, 20),
      '',
      `Full log: ${logPath}`,
    ].join('\n')
  );
}

const args = process.argv.slice(2);
const avdFlag = args.indexOf('--avd');
const requestedAvd = avdFlag === -1 ? undefined : args[avdFlag + 1];

/* Copy config and web assets into the native project. `cap sync` is the one
 * part of the CLI that works fine on every platform, so it is still delegated. */
if (!args.includes('--no-sync')) {
  const cli = require.resolve('@capacitor/cli/bin/capacitor');
  run(process.execPath, [cli, 'sync', 'android']);
}

if (!attachedDevices().length) startEmulator(requestedAvd);

/* Gradle, invoked the way the wrapper scripts invoke it.
 *
 * Not `gradlew.bat` / `./gradlew`: Node refuses to spawn `.bat` and `.cmd`
 * files without a shell (it was an argument-injection vector, CVE-2024-27980),
 * and handing this to a shell would mean quoting a path that can contain
 * spaces. Both wrapper scripts are thin launchers whose entire job is to locate
 * java and run this jar, and we have already located java — so running it
 * directly skips the problem instead of working around it, and drops the
 * per-platform branch as a bonus. */
run(
  join(javaHome, 'bin', exe('java')),
  [
    '-Dorg.gradle.appname=gradlew',
    '-jar',
    join('gradle', 'wrapper', 'gradle-wrapper.jar'),
    'assembleDebug',
  ],
  ANDROID_DIR
);

if (!existsSync(APK)) fail(`Gradle reported success but ${APK} is missing.`);

console.log('\nInstalling...');
run(adb, ['install', '-r', APK]);

console.log('Launching...');
run(adb, ['shell', 'am', 'start', '-n', `${MOBILE_APP_ID}/.MainActivity`]);

console.log(`\n${MOBILE_APP_ID} is running.`);
