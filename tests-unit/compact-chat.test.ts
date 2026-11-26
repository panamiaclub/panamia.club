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
import {
  VOICE_NOTE_MAX_BYTES,
  voiceNoteError,
  voiceNoteRecordingType,
} from '@/lib/media/voice-notes';

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
  const voice = { type: 'audio', mediaType: 'audio/mp4', url: '/voice.m4a' };

  it('sends an uploaded voice note without text and keeps recording/upload failures out of sends', () => {
    const voiceFile = new File(['recorded'], 'voice.m4a', {
      type: 'audio/mp4',
    });
    const draft = { ...EMPTY_MESSAGE_DRAFT, voice };
    assert.equal(messageDraftCanSend(draft), true);
    assert.deepEqual(messageDraftAttachments(draft), [voice]);
    assert.equal(messageDraftPreview(draft), 'Voice note');
    for (const patch of [
      { isRecordingVoice: true },
      { isUploadingVoice: true },
      { voice: null, voiceFile, voiceError: 'Upload failed' },
    ]) {
      assert.equal(
        messageDraftCanSend({ ...draft, text: 'caption', ...patch }),
        false
      );
    }
    assert.equal(
      messageDraftPreview({ ...draft, isRecordingVoice: true }),
      'Recording voice note...'
    );
    assert.equal(
      messageDraftPreview({ ...draft, isUploadingVoice: true }),
      'Uploading voice note...'
    );
    assert.equal(
      messageDraftPreview({ ...draft, voice: null, voiceFile }),
      'Voice note not uploaded'
    );
  });
  it('can send a photo without a caption and keeps GIF/photo metadata separate', () => {
    const draft = { ...EMPTY_MESSAGE_DRAFT, photo, gif };
    assert.equal(messageDraftCanSend(draft), true);
    assert.deepEqual(messageDraftAttachments(draft), [photo, gif]);
    assert.equal(messageDraftPreview({ ...draft, gif: null }), 'Photo');
    assert.equal(messageDraftCanSend(EMPTY_MESSAGE_DRAFT), false);
  });

  describe('voice note validation', () => {
    it('accepts a five-minute note, but rejects anything past the duration or size limit', () => {
      const file = {
        type: 'audio/mp4;codecs=mp4a.40.2',
        size: VOICE_NOTE_MAX_BYTES,
      };
      assert.equal(voiceNoteError(file, 300), null);
      assert.match(voiceNoteError(file, 300.001)!, /5 minutes/);
      assert.match(
        voiceNoteError({ ...file, size: VOICE_NOTE_MAX_BYTES + 1 }, 300)!,
        /10 MB/
      );
      for (const duration of [0, -1, NaN, Infinity])
        assert.match(voiceNoteError(file, duration)!, /duration/);
      assert.match(voiceNoteError({ ...file, size: 0 }, 1)!, /empty/);
      assert.match(
        voiceNoteError({ type: 'video/webm', size: 100 }, 1)!,
        /format/
      );
      assert.equal(
        voiceNoteError({ type: 'audio/webm;codecs=opus', size: 100 }, 1),
        null
      );
    });

    it('prefers AAC playback compatibility and uses Opus only when MP4 recording is unavailable', () => {
      assert.equal(
        voiceNoteRecordingType(() => true),
        'audio/mp4;codecs=mp4a.40.2'
      );
      assert.equal(
        voiceNoteRecordingType((type) => type.startsWith('audio/webm')),
        'audio/webm;codecs=opus'
      );
      assert.equal(
        voiceNoteRecordingType(() => false),
        undefined
      );
    });
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
