import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  observeVisualViewport,
  trackNativeViewport,
} from '@/lib/mobile/viewport';

function installViewport(t: TestContext) {
  const descriptors = new Map(
    ['window', 'document'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  );
  t.after(() => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const viewport = Object.assign(new EventTarget(), {
    height: 844,
    offsetTop: 0,
    scale: 1,
  });
  const properties = new Map<string, string>();
  const attributes = new Set<string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { visualViewport: viewport, innerHeight: 844 },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: {
        style: {
          getPropertyValue: (name: string) => properties.get(name) ?? '',
          setProperty: (name: string, value: string) =>
            properties.set(name, value),
          removeProperty: (name: string) => properties.delete(name),
        },
        hasAttribute: (name: string) => attributes.has(name),
        toggleAttribute: (name: string, enabled: boolean) =>
          enabled ? attributes.add(name) : attributes.delete(name),
      },
    },
  });
  return { viewport, properties, attributes };
}

test('viewport observation follows keyboard resizing and panning, but not pinch zoom', (t) => {
  const { viewport } = installViewport(t);
  const heights: number[] = [];
  const stop = observeVisualViewport((current) =>
    heights.push(current.height + current.offsetTop)
  );
  viewport.height = 500;
  viewport.dispatchEvent(new Event('resize'));
  viewport.offsetTop = 30;
  viewport.dispatchEvent(new Event('scroll'));
  viewport.scale = 2;
  viewport.height = 250;
  viewport.dispatchEvent(new Event('resize'));
  assert.deepEqual(heights, [844, 500, 530]);
  stop();
  viewport.scale = 1;
  viewport.dispatchEvent(new Event('resize'));
  assert.deepEqual(heights, [844, 500, 530]);
});

test('the native frame uses the visible height and offset and restores previous state', (t) => {
  const { viewport, properties, attributes } = installViewport(t);
  properties.set('--native-viewport-height', '600px');
  const stop = trackNativeViewport();
  assert.equal(properties.get('--native-viewport-height'), '844px');
  viewport.height = 450;
  viewport.offsetTop = 20;
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(properties.get('--native-viewport-height'), '450px');
  assert.equal(properties.get('--native-viewport-top'), '20px');
  assert.ok(attributes.has('data-native-keyboard'));
  viewport.height = 744;
  viewport.offsetTop = 0;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(!attributes.has('data-native-keyboard'));
  viewport.height = 743;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(attributes.has('data-native-keyboard'));
  stop();
  assert.equal(properties.get('--native-viewport-height'), '600px');
  assert.ok(!properties.has('--native-viewport-top'));
  assert.ok(!attributes.has('data-native-keyboard'));
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(properties.get('--native-viewport-height'), '600px');
});

test('unsupported visual viewport APIs leave existing layout state alone', (t) => {
  const { properties, attributes } = installViewport(t);
  Reflect.deleteProperty(window, 'visualViewport');
  properties.set('--native-viewport-height', '600px');
  attributes.add('data-native-keyboard');
  const stop = trackNativeViewport();
  assert.equal(properties.get('--native-viewport-height'), '600px');
  stop();
  assert.ok(attributes.has('data-native-keyboard'));
});
