import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_MESSAGE_DRAFT,
  composerEnterSends,
  messageDraftAttachments,
  messageDraftCanSend,
  messageDraftPreview,
} from '@/app/messages/_lib/workspace';
import {
  CHAT_PHOTO_MAX_BYTES,
  chatPhotoError,
} from '@/app/messages/_lib/photos';

const photo = {
  type: 'image',
  mediaType: 'image/jpeg',
  url: 'https://media.example.invalid/photo.jpg',
  name: 'photo.jpg',
};
const gif = {
  ...photo,
  mediaType: 'image/gif',
  url: 'https://media.example.invalid/a.gif',
};

describe('compact chat drafts', () => {
  it('can send a photo without a caption and keeps GIF/photo metadata separate', () => {
    const draft = { ...EMPTY_MESSAGE_DRAFT, photo, gif };
    assert.equal(messageDraftCanSend(draft), true);
    assert.deepEqual(messageDraftAttachments(draft), [photo, gif]);
    assert.equal(messageDraftPreview({ ...draft, gif: null }), 'Photo');
    assert.equal(messageDraftCanSend(EMPTY_MESSAGE_DRAFT), false);
  });

  it('never sends a pending or failed chosen photo as a text-only success', () => {
    const photoFile = new File(['pending'], 'camera.jpg', {
      type: 'image/jpeg',
    });
    const draft = {
      ...EMPTY_MESSAGE_DRAFT,
      text: 'Keep my caption',
      photoFile,
    };
    assert.equal(
      messageDraftCanSend({ ...draft, isUploadingPhoto: true }),
      false
    );
    assert.equal(
      messageDraftCanSend({ ...draft, photoError: 'Upload failed' }),
      false
    );
    assert.equal(
      messageDraftPreview({ ...draft, text: '', isUploadingPhoto: true }),
      'Uploading photo...'
    );
    assert.equal(
      messageDraftPreview({ ...draft, text: '', photoError: 'Upload failed' }),
      'Photo not uploaded'
    );
    assert.equal(messageDraftCanSend({ ...draft, photoFile: null }), true);
  });

  it('preserves the existing GIF busy guard', () => {
    assert.equal(
      messageDraftCanSend({
        ...EMPTY_MESSAGE_DRAFT,
        text: 'Caption',
        isMirroring: true,
      }),
      false
    );
    assert.deepEqual(messageDraftAttachments(EMPTY_MESSAGE_DRAFT), []);
  });

  it('uses Return for a phone newline and keeps desktop send/Shift/IME behavior', () => {
    assert.equal(composerEnterSends(true, false, false), false);
    assert.equal(composerEnterSends(false, false, false), true);
    assert.equal(composerEnterSends(false, true, false), false);
    assert.equal(composerEnterSends(false, false, true), false);
  });
});

describe('chat photo validation', () => {
  it('accepts supported photos at the real existing 10 MB upload boundary', () => {
    for (const type of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
    ]) {
      assert.equal(chatPhotoError({ type, size: CHAT_PHOTO_MAX_BYTES }), null);
    }
    assert.match(
      chatPhotoError({ type: 'image/jpeg', size: CHAT_PHOTO_MAX_BYTES + 1 })!,
      /10 MB/
    );
  });

  it('rejects empty images, SVG, audio and video instead of exposing fake controls', () => {
    assert.match(chatPhotoError({ type: 'image/jpeg', size: 0 })!, /empty/);
    for (const type of [
      'image/svg+xml',
      'audio/mp4',
      'video/mp4',
      'text/html',
    ]) {
      assert.match(chatPhotoError({ type, size: 100 })!, /Choose/);
    }
  });
});
