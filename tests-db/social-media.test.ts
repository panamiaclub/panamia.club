import { after, beforeEach, it, mock } from 'node:test';
import assert from 'node:assert/strict';

let signedIn = true;
let hasActor = true;
let uploads = 0;
let signatures = 0;

mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: {
    auth: async () => (signedIn ? { user: { id: 'fixture-user' } } : null),
  },
});
mock.module(import.meta.resolve('../lib/server/active-profile.ts'), {
  namedExports: {
    getActiveProfileWithActor: async () =>
      hasActor ? { socialActor: { id: 'fixture-actor' } } : null,
  },
});
mock.module(import.meta.resolve('../lib/blob/api.ts'), {
  namedExports: {
    uploadFile: async () => {
      uploads += 1;
      return 'https://uploads.invalid/fixture';
    },
  },
});
mock.module(import.meta.resolve('aws4fetch'), {
  namedExports: {
    AwsClient: class {
      async sign() {
        signatures += 1;
        return new Request('https://storage.invalid/signed');
      }
    },
  },
});

const { NextRequest } = await import('next/server');
const { POST: upload } = await import('../app/api/social/media/route');
const { POST: presign } = await import('../app/api/social/media/upload/route');
after(() => mock.restoreAll());
beforeEach(() => {
  signedIn = true;
  hasActor = true;
  uploads = 0;
  signatures = 0;
});

const audioTypes = [
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/mp4',
  'audio/mpeg',
];

function multipart(contentType: string, voiceDuration?: string) {
  const body = new FormData();
  body.set('file', new File(['fixture'], 'fixture', { type: contentType }));
  if (voiceDuration !== undefined) {
    body.set('purpose', 'voice-note');
    body.set('duration', voiceDuration);
  }
  return new NextRequest('https://social.invalid/api/social/media', {
    method: 'POST',
    body,
  });
}

function uploadToken(contentType: string) {
  return new NextRequest('https://social.invalid/api/social/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'social/media/fixture.mp4',
      contentType,
      size: 7,
    }),
  });
}

it('rejects standalone audio before any multipart upload reaches storage', async () => {
  for (const type of audioTypes) {
    const response = await upload(multipart(type));
    assert.equal(response.status, 400, type);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Unsupported file type/);
  }
  assert.equal(uploads, 0);
});

it('does not issue upload URLs for any standalone audio format', async () => {
  for (const type of audioTypes) {
    const response = await presign(uploadToken(type));
    assert.equal(response.status, 400, type);
    assert.match((await response.json()).error, /Unsupported type/);
  }
  assert.equal(signatures, 0);
});

it('uploads authenticated voice notes with normalized audio metadata', async () => {
  for (const type of ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus']) {
    const response = await upload(multipart(type, '300'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.type, 'audio');
    assert.equal(body.data.mediaType, type.split(';')[0]);
  }
  assert.equal(uploads, 2);
});

it('rejects invalid voice note durations and formats before touching storage', async () => {
  for (const duration of ['0', '-1', 'NaN', 'Infinity', '300.001']) {
    assert.equal((await upload(multipart('audio/mp4', duration))).status, 400);
  }
  assert.equal((await upload(multipart('video/mp4', '10'))).status, 400);
  assert.equal(uploads, 0);
});

it('continues uploading photos, GIFs, MP4, and legacy WebM video', async () => {
  for (const type of ['image/png', 'image/gif', 'video/mp4', 'video/webm']) {
    const response = await upload(multipart(type));
    assert.equal(response.status, 200, type);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.mediaType, type);
    assert.equal(body.data.type, type.startsWith('image/') ? 'image' : 'video');
    assert.equal(body.data.url, 'https://uploads.invalid/fixture');
  }
  assert.equal(uploads, 4);
});

it('continues issuing direct video upload URLs', async () => {
  for (const type of ['video/mp4', 'video/webm']) {
    const response = await presign(uploadToken(type));
    assert.equal(response.status, 200, type);
    const body = await response.json();
    assert.equal(body.presignedUrl, 'https://storage.invalid/signed');
    assert.ok(body.publicUrl.endsWith('/social/media/fixture.mp4'));
  }
  assert.equal(signatures, 2);
});

it('keeps authentication and social-profile upload gates', async () => {
  signedIn = false;
  assert.equal((await upload(multipart('image/png'))).status, 401);
  assert.equal((await presign(uploadToken('video/mp4'))).status, 401);
  signedIn = true;
  hasActor = false;
  assert.equal((await upload(multipart('image/png'))).status, 403);
  assert.equal(uploads, 0);
  assert.equal(signatures, 0);
});
