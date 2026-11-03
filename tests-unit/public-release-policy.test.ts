import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import terms from '@/app/legal/terms/policy.json';
import privacy from '@/app/legal/privacy/policy.json';
import { moduleDefinitions } from '@/app/legal/terms/module-content';
import {
  getDocumentVersion,
  getModuleMajorVersion,
  parseMajorVersion,
} from '@/lib/legal/policy-version';

test('published policy versions trigger major-version consent renewal consistently', () => {
  assert.equal(getDocumentVersion('terms', null), terms.version);
  assert.equal(getDocumentVersion('privacy', null), privacy.version);
  assert.equal(parseMajorVersion(terms.version), 1);
  assert.equal(parseMajorVersion(privacy.version), 1);
  assert.deepEqual(
    moduleDefinitions.map((module) => module.id).sort(),
    terms.modules.map((module) => module.name).sort()
  );
  for (const module of terms.modules) {
    assert.equal(module.version, terms.version);
    assert.equal(getModuleMajorVersion(module.name), 1);
    const definition = moduleDefinitions.find(
      (item) => item.id === module.name
    );
    assert.ok(definition && definition.terms.length >= 2);
  }
});

test('public policies contain actionable deletion and child-safety sections without placeholders', () => {
  const privacyPage = readFileSync(
    new URL('../app/legal/privacy/page.tsx', import.meta.url),
    'utf8'
  );
  const termsPage = readFileSync(
    new URL('../app/legal/terms/page.tsx', import.meta.url),
    'utf8'
  );
  const modules = readFileSync(
    new URL('../app/legal/terms/module-content.tsx', import.meta.url),
    'utf8'
  );
  for (const source of [privacyPage, termsPage, modules]) {
    assert.doesNotMatch(
      source,
      /full legal text to be drafted|<Placeholder|mailto:hola@pana\.social/
    );
  }
  assert.match(privacyPage, /id="delete-account"/);
  assert.match(privacyPage, /href="\/form\/delete-account"/);
  assert.match(termsPage, /id="child-safety"/);
  assert.match(termsPage, /href="\/form\/contact-us"/);
  assert.equal(terms.childSafety.reportEmail, 'hola@panamia.club');
  assert.match(privacyPage, /record it with the/);
  assert.doesNotMatch(privacyPage, /disable any non-essential analytics/);
});
