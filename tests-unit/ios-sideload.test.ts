import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { test } from 'node:test';
import config from '../capacitor.config';
import { MOBILE_APP_ID } from '@/lib/mobile/app-identity';
import {
  iosSideloadBuildArgs,
  iosSideloadBundleId,
  parseIosSideloadOptions,
} from '../scripts/ios-sideload';

const teamId = 'ABCDE12345';
const deviceId = '00008110-0012345678901234';
const args = ['--team-id', teamId, '--device', deviceId];

test('personal sideloading requires an explicit personal team and physical iPhone', () => {
  assert.deepEqual(parseIosSideloadOptions(args, {}), { teamId, deviceId });
  assert.deepEqual(
    parseIosSideloadOptions(['--device', deviceId], {
      IOS_PERSONAL_TEAM_ID: teamId,
    }),
    { teamId, deviceId }
  );
  assert.throws(() =>
    parseIosSideloadOptions(['--device', deviceId], { APPLE_TEAM_ID: teamId })
  );
  assert.equal(
    parseIosSideloadOptions(
      ['--team-id', teamId, '--device', 'a'.repeat(40)],
      {}
    ).deviceId,
    'a'.repeat(40)
  );
  for (const invalid of [
    [],
    ['--team-id', 'invalid', '--device', deviceId],
    ['--team-id', teamId],
    [...args, '--team-id', teamId],
    [...args, '--device', deviceId],
    [...args, '--unknown', 'value'],
    ['--team-id', teamId, '--device', '11111111-2222-4333-8444-555555555555'],
    ['--team-id', teamId, '--device', '../../other'],
    ['--team-id', teamId, '--device', '-destination'],
  ]) {
    assert.throws(() => parseIosSideloadOptions(invalid, {}));
  }
});

test('personal signing uses a distinct bundle ID and disables paid capabilities only for Debug', () => {
  const bundleId = iosSideloadBundleId(teamId);
  assert.equal(bundleId, `${MOBILE_APP_ID}.personal.abcde12345`);
  assert.notEqual(iosSideloadBundleId('ZYXWV98765'), bundleId);
  assert.equal(config.appId, MOBILE_APP_ID);
  const build = iosSideloadBuildArgs({ teamId, deviceId });
  assert.equal(build[build.indexOf('-configuration') + 1], 'Debug');
  assert.equal(build[build.indexOf('-destination') + 1], `id=${deviceId}`);
  for (const flag of [
    `DEVELOPMENT_TEAM=${teamId}`,
    'CODE_SIGN_STYLE=Automatic',
    'CODE_SIGN_ENTITLEMENTS=',
    `PRODUCT_BUNDLE_IDENTIFIER=${bundleId}`,
    '-allowProvisioningUpdates',
    '-allowProvisioningDeviceRegistration',
  ]) {
    assert.ok(build.includes(flag), flag);
  }
  assert.ok(!build.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(!build.includes('archive'));
  const entitlements = readFileSync(
    new URL('../mobile/ios/App/App/App.entitlements', import.meta.url),
    'utf8'
  );
  assert.match(entitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(entitlements, /applinks:panamia\.club/);
});

test('the sideload CLI provides help without attempting native signing', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/ios-sideload.ts', '--help'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Personal Team/);
  assert.match(result.stdout, /--list-devices/);
});

test(
  'non-Mac hosts cannot report a successful device installation',
  {
    skip: platform() === 'darwin',
  },
  () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/ios-sideload.ts', ...args],
      { encoding: 'utf8' }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires macOS with Xcode/);
  }
);
