import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import terms from '../app/legal/terms/policy.json';
import privacy from '../app/legal/privacy/policy.json';

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('native minimum age stays aligned with the published terms', () => {
  const policy = read('mobile/ios/App/App/AgeAssurancePolicy.swift');
  assert.equal(terms.eligibility.minimumAge, 18);
  assert.equal(
    privacy.nativeAgeAssurance.minimumAge,
    terms.eligibility.minimumAge
  );
  assert.equal(privacy.nativeAgeAssurance.transmittedToPana, false);
  assert.equal(privacy.nativeAgeAssurance.persistentStorage, false);
  assert.equal(
    privacy.nativeAgeAssurance.collectsBirthDateOrIdentityDocuments,
    false
  );
  assert.match(
    policy,
    new RegExp(`static let minimumAge = ${terms.eligibility.minimumAge}\\b`)
  );
  assert.match(policy, /guard let lowerBound, lowerBound >= minimumAge/);
});

test('every iOS launch enters the native gate before constructing a WebView', () => {
  const scene = read('mobile/ios/App/App/SceneDelegate.swift');
  const storyboard = read('mobile/ios/App/App/Base.lproj/Main.storyboard');
  const gate = read('mobile/ios/App/App/AgeAssuranceViewController.swift');
  assert.match(scene, /rootViewController = AgeAssuranceViewController\(\)/);
  assert.match(
    storyboard,
    /customClass="AgeAssuranceViewController" customModule="App"/
  );
  assert.match(scene, /prepareForBackground\(\)/);
  assert.match(scene, /becameActive\(\)/);
  assert.match(gate, /case \.allowed:\s+if appController == nil/);
  assert.match(
    gate,
    /view\.insertSubview\(controller\.view, belowSubview: gate\)/
  );
  assert.match(gate, /generation == requestGeneration/);
  assert.match(gate, /case \.blocked\(let reason\):\s+removeApp\(\)/);
});

test('age data uses Apple eligibility and stays off the JavaScript bridge', () => {
  const gate = read('mobile/ios/App/App/AgeAssuranceViewController.swift');
  assert.match(gate, /isEligibleForAgeFeatures/);
  assert.match(gate, /requiredRegulatoryFeatures/);
  assert.match(
    gate,
    /requestAgeRange\(ageGates: AgeAssurancePolicy\.minimumAge/
  );
  assert.match(gate, /case \.declinedSharing:\s+return \.blocked/);
  assert.match(gate, /@unknown default:\s+return \.blocked/);
  assert.doesNotMatch(
    gate,
    /CAPPlugin|notifyListeners|UserDefaults|URLSession|localStorage|ageRangeDeclaration/
  );
});

test('both native localizations cover the gate and keep recovery controls', () => {
  const english = read('mobile/ios/App/App/en.lproj/Localizable.strings');
  const spanish = read('mobile/ios/App/App/es.lproj/Localizable.strings');
  const keys = (value: string) =>
    [...value.matchAll(/^"([^"]+)"\s*=/gm)].map((match) => match[1]).sort();
  assert.deepEqual(keys(spanish), keys(english));
  for (const key of [
    'age.retry',
    'age.privacy',
    'age.terms',
    'age.error.message',
  ]) {
    assert.ok(keys(english).includes(key));
  }
  const gate = read('mobile/ios/App/App/AgeAssuranceViewController.swift');
  assert.match(
    gate,
    /heightAnchor\.constraint\(greaterThanOrEqualToConstant: 44\)/
  );
  assert.match(gate, /UIScrollView\(\)/);
  assert.match(gate, /adjustsFontForContentSizeCategory = true/);
});
