import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOBILE_APP_ID } from '../lib/mobile/app-identity';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

export interface IosSideloadOptions {
  teamId: string;
  deviceId: string;
}

export function parseIosSideloadOptions(
  args: string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): IosSideloadOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag !== '--team-id' && flag !== '--device')
      throw new Error(`Unknown option: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    if (!value || value.startsWith('-'))
      throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  const teamId = (
    values.get('--team-id') ??
    env.IOS_PERSONAL_TEAM_ID ??
    ''
  ).trim();
  const deviceId = values.get('--device') ?? '';
  if (!/^[A-Z0-9]{10}$/.test(teamId))
    throw new Error(
      'Set --team-id or IOS_PERSONAL_TEAM_ID to your 10-character Personal Team ID from Xcode.'
    );
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{16})$/i.test(deviceId))
    throw new Error(
      '--device must be a physical iPhone UDID. Run yarn mobile:sideload:ios --list-devices or copy the Identifier from Xcode Devices and Simulators.'
    );
  return { teamId, deviceId };
}

export function iosSideloadBundleId(teamId: string): string {
  // Never reserve the organization's permanent App ID in a personal team.
  return `${MOBILE_APP_ID}.personal.${teamId.toLowerCase()}`;
}

export function iosSideloadBuildArgs(
  options: IosSideloadOptions,
  root = ROOT
): string[] {
  return [
    '-project',
    join(root, 'mobile', 'ios', 'App', 'App.xcodeproj'),
    '-scheme',
    'App',
    '-configuration',
    'Debug',
    '-destination',
    `id=${options.deviceId}`,
    '-derivedDataPath',
    join(root, 'mobile', 'ios', 'App', 'build', 'personal', options.teamId),
    '-allowProvisioningUpdates',
    '-allowProvisioningDeviceRegistration',
    '-quiet',
    `DEVELOPMENT_TEAM=${options.teamId}`,
    'CODE_SIGN_STYLE=Automatic',
    'CODE_SIGN_ENTITLEMENTS=',
    `PRODUCT_BUNDLE_IDENTIFIER=${iosSideloadBundleId(options.teamId)}`,
    'build',
  ];
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: yarn mobile:sideload:ios --team-id ABCDE12345 --device IPHONE_UDID\n       yarn mobile:sideload:ios --list-devices\n\nRun on a Mac with Xcode and your Personal Team signed in. See docs/IOS.md.'
    );
    return;
  }
  const listDevices = args.length === 1 && args[0] === '--list-devices';
  const options = listDevices ? null : parseIosSideloadOptions(args);
  if (platform() !== 'darwin')
    throw new Error(
      'iPhone sideloading requires macOS with Xcode. Run this command on your Mac.'
    );
  const nativeRun = require.resolve('native-run/bin/native-run');
  if (!options) {
    execFileSync(process.execPath, [nativeRun, 'ios', '--list', '--device'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    return;
  }

  const bundleId = iosSideloadBundleId(options.teamId);
  console.log(`Building a personal development copy: ${bundleId}`);
  console.log(
    'Universal Links are disabled only for this build; App Store signing settings are unchanged.'
  );
  execFileSync(
    process.execPath,
    [require.resolve('@capacitor/cli/bin/capacitor'), 'sync', 'ios'],
    { cwd: ROOT, stdio: 'inherit' }
  );
  execFileSync('xcrun', ['xcodebuild', ...iosSideloadBuildArgs(options)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  const app = join(
    ROOT,
    'mobile',
    'ios',
    'App',
    'build',
    'personal',
    options.teamId,
    'Build',
    'Products',
    'Debug-iphoneos',
    'App.app'
  );
  if (!existsSync(app))
    throw new Error(
      `Xcode reported success but the development app is missing: ${app}`
    );
  const actualId = execFileSync(
    'plutil',
    [
      '-extract',
      'CFBundleIdentifier',
      'raw',
      '-o',
      '-',
      join(app, 'Info.plist'),
    ],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  if (actualId !== bundleId)
    throw new Error(`Refusing to install an unexpected bundle ID: ${actualId}`);
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [nativeRun, 'ios', '--app', app, '--target', options.deviceId],
    { cwd: ROOT, stdio: 'inherit' }
  );
  console.log(
    '\nDevelopment build installed. Free Personal Team provisioning expires after seven days; rerun this command to renew it.'
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main();
  } catch (error) {
    console.error('iOS sideload failed:', error);
    process.exitCode = 1;
  }
}
