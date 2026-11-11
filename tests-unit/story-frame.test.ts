import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  STORY_FRAME_HEIGHT,
  STORY_FRAME_WIDTH,
  storyFrameCrop,
} from '@/lib/media/story-frame';

it('center-crops a landscape camera into portrait without stretching', () => {
  assert.deepEqual(storyFrameCrop(1280, 720), {
    x: 437.5,
    y: 0,
    width: 405,
    height: 720,
  });
  assert.equal(STORY_FRAME_WIDTH, 720);
  assert.equal(STORY_FRAME_HEIGHT, 1280);
});

it('keeps portrait cameras intact and trims overly tall sources evenly', () => {
  assert.deepEqual(storyFrameCrop(720, 1280), {
    x: 0,
    y: 0,
    width: 720,
    height: 1280,
  });
  assert.deepEqual(storyFrameCrop(720, 1600), {
    x: 0,
    y: 160,
    width: 720,
    height: 1280,
  });
});

it('always produces a centered 9:16 crop inside the original frame', () => {
  for (const [width, height] of [
    [640, 480],
    [1920, 1080],
    [1080, 1920],
    [640, 640],
  ]) {
    const crop = storyFrameCrop(width, height);
    assert.equal(crop.width / crop.height, 9 / 16);
    assert.equal(crop.x * 2 + crop.width, width);
    assert.equal(crop.y * 2 + crop.height, height);
    assert.ok(crop.x >= 0 && crop.y >= 0);
  }
});

it('reports missing or invalid camera dimensions instead of encoding a blank frame', () => {
  for (const [width, height] of [
    [0, 720],
    [1280, 0],
    [-1, 720],
    [NaN, 720],
    [720, Infinity],
  ]) {
    assert.throws(
      () => storyFrameCrop(width, height),
      /not ready for a portrait capture/
    );
  }
});
