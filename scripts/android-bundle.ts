/**
 * Builds the signed Android App Bundle uploaded to Google Play.
 *
 * Usage:
 *   yarn mobile:bundle:android --version-code 1 --version-name 1.0.0
 *   yarn mobile:bundle:android --version-code 2 --version-name 1.0.1 --no-sync
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const IS_WINDOWS = platform() === 'win32';
const IS_MAC = platform() === 'darwin';
const MINIMUM_JDK = 17;
const ROOT = resolve(import.meta.dirname, '..');
const ANDROID_DIR = join(ROOT, 'mobile', 'android');
const KEYSTORE_PROPERTIES = join(ANDROID_DIR, 'keystore.properties');
const BUNDLE = join(
  ANDROID_DIR,
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab'
);

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function isJdk(dir: string): boolean {
  return existsSync(join(dir, 'bin', IS_WINDOWS ? 'java.exe' : 'java'));
}

function majorVersion(name: string): number {
  const match = name.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

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

  return [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    ...defaults,
  ].find((candidate): candidate is string =>
    Boolean(candidate && existsSync(candidate))
  );
}

function findJdk(): string | undefined {
  if (process.env.JAVA_HOME && isJdk(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }

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

const versionCode = valueAfter('--version-code');
const versionName = valueAfter('--version-name');

if (!versionCode || !/^[1-9]\d*$/.test(versionCode)) {
  fail(
    '--version-code must be a positive integer and must increase for every Play upload.'
  );
}

if (
  !versionName ||
  !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName)
) {
  fail('--version-name must be a semantic version such as 1.0.0.');
}

if (!existsSync(KEYSTORE_PROPERTIES)) {
  fail(
    [
      `Missing ${KEYSTORE_PROPERTIES}.`,
      'Create the upload keystore and properties file using docs/ANDROID.md.',
    ].join('\n')
  );
}

const javaHome =
  findJdk() ??
  fail(
    `Could not find a JDK ${MINIMUM_JDK} or newer. Install JDK 21 or set JAVA_HOME.`
  );
const androidSdk =
  findAndroidSdk() ??
  fail('Could not find the Android SDK. Install it or set ANDROID_HOME.');
const java = join(javaHome, 'bin', IS_WINDOWS ? 'java.exe' : 'java');
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidSdk,
};

if (!process.argv.includes('--no-sync')) {
  console.log('Syncing Capacitor Android project...');
  execFileSync(
    process.execPath,
    [require.resolve('@capacitor/cli/bin/capacitor'), 'sync', 'android'],
    { cwd: ROOT, env, stdio: 'inherit' }
  );
}

console.log(
  `Building signed Android bundle ${versionName} (${versionCode})...`
);
execFileSync(
  java,
  [
    '-Dorg.gradle.appname=gradlew',
    '-jar',
    join('gradle', 'wrapper', 'gradle-wrapper.jar'),
    'bundleRelease',
    `-PversionCode=${versionCode}`,
    `-PversionName=${versionName}`,
    '--no-daemon',
  ],
  { cwd: ANDROID_DIR, env, stdio: 'inherit' }
);

if (!existsSync(BUNDLE)) {
  fail(`Gradle reported success but ${BUNDLE} is missing.`);
}

console.log(`\nPlay-ready bundle: ${BUNDLE}`);
