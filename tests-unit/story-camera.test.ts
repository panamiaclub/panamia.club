import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const manifest = readFileSync(
  new URL(
    '../mobile/android/app/src/main/AndroidManifest.xml',
    import.meta.url
  ),
  'utf8'
);

test('Android declares every permission requested by Capacitor for live video and sound', () => {
  for (const permission of [
    'CAMERA',
    'RECORD_AUDIO',
    'MODIFY_AUDIO_SETTINGS',
  ]) {
    assert.match(
      manifest,
      new RegExp(
        `<uses-permission\\s+android:name="android\\.permission\\.${permission}"\\s*/>`
      )
    );
  }
  assert.doesNotMatch(
    manifest,
    /android\.permission\.(?:READ|WRITE)_EXTERNAL_STORAGE/
  );
});

test('camera and microphone permissions do not make hardware mandatory for installation', () => {
  for (const feature of ['camera', 'camera.autofocus', 'microphone']) {
    assert.match(
      manifest,
      new RegExp(
        `<uses-feature\\s+android:name="android\\.hardware\\.${feature.replaceAll('.', '\\.')}"\\s+android:required="false"\\s*/>`
      )
    );
  }
});

test('the shared camera UI has the iOS usage descriptions needed to request access safely', () => {
  const plist = readFileSync(
    new URL('../mobile/ios/App/App/Info.plist', import.meta.url),
    'utf8'
  );
  for (const key of [
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
  ]) {
    assert.match(
      plist,
      new RegExp(`<key>${key}</key>\\s*<string>[^<]+</string>`)
    );
  }
});
