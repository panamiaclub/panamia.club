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
  const browser = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 390,
    innerHeight: 844,
  });
  let editing = false;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browser,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      activeElement: {
        matches: (selector: string) => selector === ':read-write' && editing,
      },
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
  return {
    viewport,
    properties,
    attributes,
    browser,
    setEditing: (value: boolean) => {
      editing = value;
    },
  };
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

test('native resizing detects the keyboard when the layout and visual viewport shrink together', (t) => {
  const { browser, viewport, properties, attributes, setEditing } =
    installViewport(t);
  setEditing(true);
  const stop = trackNativeViewport();
  for (const height of [744, 743, 390, 844]) {
    browser.innerHeight = height;
    viewport.height = height;
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(properties.get('--native-viewport-height'), `${height}px`);
    assert.equal(attributes.has('data-native-keyboard'), height < 744);
  }
  stop();
});

test('focusing with a hardware keyboard and an ordinary unfocused resize do not hide the dock', (t) => {
  const { browser, viewport, attributes, setEditing } = installViewport(t);
  const stop = trackNativeViewport();
  setEditing(true);
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(!attributes.has('data-native-keyboard'));
  setEditing(false);
  browser.innerHeight = 600;
  viewport.height = 600;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(!attributes.has('data-native-keyboard'));
  setEditing(true);
  browser.innerHeight = 390;
  viewport.height = 390;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(attributes.has('data-native-keyboard'));
  stop();
});

test('rotation resets the available layout height rather than treating landscape as a keyboard', (t) => {
  const { browser, viewport, attributes, setEditing } = installViewport(t);
  const stop = trackNativeViewport();
  setEditing(true);
  browser.innerWidth = 844;
  browser.innerHeight = 390;
  viewport.height = 390;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(!attributes.has('data-native-keyboard'));
  browser.innerHeight = 200;
  viewport.height = 200;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(attributes.has('data-native-keyboard'));
  browser.innerHeight = 390;
  viewport.height = 390;
  viewport.dispatchEvent(new Event('resize'));
  assert.ok(!attributes.has('data-native-keyboard'));
  stop();
});

test('layout-only resize events update the native viewport and are removed on cleanup', (t) => {
  const { browser, viewport, properties, attributes, setEditing } =
    installViewport(t);
  setEditing(true);
  properties.set('--native-viewport-height', '600px');
  attributes.add('data-native-keyboard');
  const stop = trackNativeViewport();
  browser.innerHeight = 390;
  viewport.height = 390;
  browser.dispatchEvent(new Event('resize'));
  assert.equal(properties.get('--native-viewport-height'), '390px');
  assert.ok(attributes.has('data-native-keyboard'));
  stop();
  browser.innerHeight = 844;
  viewport.height = 844;
  browser.dispatchEvent(new Event('resize'));
  assert.equal(properties.get('--native-viewport-height'), '600px');
  assert.ok(attributes.has('data-native-keyboard'));
});
