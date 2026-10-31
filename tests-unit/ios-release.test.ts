import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import config from '../capacitor.config';
import {
  assertIosProductionServer,
  hasAppleAppAssociation,
  iosExportOptions,
  parseIosBuildOptions,
} from '../scripts/ios-bundle';
import { MOBILE_APP_ID } from '@/lib/mobile/app-identity';

const args = ['--version-name', '1.0.0', '--build-number', '1'];
const env = { APPLE_TEAM_ID: 'ABCDE12345' };

test('iOS release versions and signing team are explicit and validated', () => {
  assert.deepEqual(parseIosBuildOptions(args, env), {
    versionName: '1.0.0',
    buildNumber: '1',
    teamId: env.APPLE_TEAM_ID,
    provisioningProfile: undefined,
  });
  assert.equal(
    parseIosBuildOptions([...args, '--team-id', 'ZYXWV98765'], env).teamId,
    'ZYXWV98765'
  );
  for (const build of ['0', '-1', '1.5', '10000', '01', 'Infinity']) {
    assert.throws(() =>
      parseIosBuildOptions(
        ['--version-name', '1.0.0', '--build-number', build],
        env
      )
    );
  }
  for (const version of ['1', '1.0', '01.0.0', '1.0.0-beta.1', '../1.0.0']) {
    assert.throws(() =>
      parseIosBuildOptions(
        ['--version-name', version, '--build-number', '1'],
        env
      )
    );
  }
  for (const invalid of [
    args,
    [...args, '--team-id', 'wrong'],
    [...args, '--build-number', '2'],
    [...args, '--unknown', 'value'],
    [...args, '--provisioning-profile'],
  ]) {
    assert.throws(() => parseIosBuildOptions(invalid, {}));
  }
});

test('a release cannot accidentally point at a development or preview deployment', () => {
  assert.doesNotThrow(() => assertIosProductionServer('https://panamia.club'));
  assert.doesNotThrow(() => assertIosProductionServer('https://panamia.club/'));
  for (const url of [
    undefined,
    'http://localhost:3000',
    'http://panamia.club',
    'https://preview.example/',
    'https://panamia.club/signin',
    'https://panamia.club?preview=1',
    'https://member@panamia.club',
  ]) {
    assert.throws(() => assertIosProductionServer(url));
  }
});

test('both association formats must authorize this exact team and bundle identifier', () => {
  for (const detail of [
    { appIDs: [`${env.APPLE_TEAM_ID}.${MOBILE_APP_ID}`] },
    { appID: `${env.APPLE_TEAM_ID}.${MOBILE_APP_ID}` },
  ]) {
    assert.equal(
      hasAppleAppAssociation(
        { applinks: { details: [detail] } },
        env.APPLE_TEAM_ID
      ),
      true
    );
  }
  for (const payload of [
    null,
    {},
    { applinks: null },
    { applinks: { details: {} } },
    { applinks: { details: [null, 'invalid', {}] } },
    { applinks: { details: [{ appIDs: [`OTHER12345.${MOBILE_APP_ID}`] }] } },
    { applinks: { details: [{ appID: `${env.APPLE_TEAM_ID}.wrong.app` }] } },
  ]) {
    assert.equal(hasAppleAppAssociation(payload, env.APPLE_TEAM_ID), false);
  }
});

test('App Store export preserves explicit versioning and supports local or CI signing', () => {
  const automatic = iosExportOptions(parseIosBuildOptions(args, env));
  assert.match(automatic, /<string>app-store-connect<\/string>/);
  assert.match(
    automatic,
    /<key>manageAppVersionAndBuildNumber<\/key><false\/>/
  );
  assert.match(
    automatic,
    /<key>signingStyle<\/key><string>automatic<\/string>/
  );
  assert.doesNotMatch(automatic, /provisioningProfiles/);
  const manual = iosExportOptions(
    parseIosBuildOptions(
      [...args, '--provisioning-profile', 'Pana & Friends <Distribution>'],
      env
    )
  );
  assert.match(manual, /<key>signingStyle<\/key><string>manual<\/string>/);
  assert.match(manual, /<string>Apple Distribution<\/string>/);
  assert.ok(manual.includes(`<key>${MOBILE_APP_ID}</key>`));
  assert.match(manual, /Pana &amp; Friends &lt;Distribution&gt;/);
});

test('the iOS shell includes only supported plugins and the matching native identity', () => {
  assert.equal(config.appId, MOBILE_APP_ID);
  assert.equal(config.ios?.contentInset, 'never');
  assert.equal(config.ios?.preferredContentMode, 'mobile');
  assert.ok(
    !config.ios?.includePlugins?.includes('@capgo/capacitor-social-login')
  );
  const swift = readFileSync(
    new URL('../mobile/ios/App/CapApp-SPM/Package.swift', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(swift, /CapgoCapacitorSocialLogin/);
  for (const plugin of [
    'CapacitorApp',
    'CapacitorBrowser',
    'CapacitorNetwork',
    'CapacitorSplashScreen',
    'CapacitorStatusBar',
  ]) {
    assert.ok(swift.includes(`.product(name: "${plugin}"`));
  }
  const plist = readFileSync(
    new URL('../mobile/ios/App/App/Info.plist', import.meta.url),
    'utf8'
  );
  assert.match(
    plist,
    /<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]+<\/string>/
  );
  const scene = readFileSync(
    new URL('../mobile/ios/App/App/SceneDelegate.swift', import.meta.url),
    'utf8'
  );
  assert.match(scene, /rootViewController = PanaBridgeViewController\(\)/);
  assert.match(scene, /allowsBackForwardNavigationGestures = true/);
});
