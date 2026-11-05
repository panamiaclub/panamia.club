import { createServer } from 'node:http';
import { expect, type Page } from '@playwright/test';

export async function chatPhotoFile(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff8b38';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg');
  });
  const pixels = Buffer.from(data.split(',')[1], 'base64');
  const metadata = Buffer.from('fixture-private-camera-metadata');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(metadata.length + 2);
  return {
    name: 'camera.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.concat([
      pixels.subarray(0, 2),
      Buffer.from([0xff, 0xfe]),
      length,
      metadata,
      pixels.subarray(2),
    ]),
  };
}

export async function installChatPhotoFixtures(
  page: Page,
  options: { failUploads?: number; hold?: () => Promise<void> } = {}
) {
  const uploads: { name: string; type: string; bytes: Buffer; url: string }[] =
    [];
  const errors: string[] = [];
  let failures = options.failUploads ?? 0;
  // WebKit's intercepted postData omits multipart file bytes. Receive the real
  // HTTP upload instead so JPEG encoding/metadata assertions stay meaningful.
  const server = createServer(async (request, response) => {
    response.setHeader(
      'Access-Control-Allow-Origin',
      request.headers.origin ?? '*'
    );
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const form = await new Request('http://127.0.0.1/upload', {
        method: 'POST',
        headers,
        body: Uint8Array.from(Buffer.concat(chunks)),
      }).formData();
      const file = form.get('file');
      if (!file || typeof file === 'string')
        throw new Error('Photo file is missing');
      const bytes = Buffer.from(await file.arrayBuffer());
      const url = `https://uploads.chat.invalid/chat-photo-${uploads.length}.jpg`;
      uploads.push({ name: file.name, type: file.type, bytes, url });
      expect(file.type).toBe('image/jpeg');
      expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      expect(
        bytes.includes(Buffer.from('fixture-private-camera-metadata'))
      ).toBe(false);
      if (options.hold) await options.hold();
      if (failures-- > 0) {
        response.writeHead(503).end(
          JSON.stringify({
            success: false,
            error: 'Photo upload is unavailable.',
          })
        );
        return;
      }
      response.end(
        JSON.stringify({
          success: true,
          data: {
            type: 'image',
            mediaType: 'image/jpeg',
            url,
            name: file.name,
          },
        })
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Photo receiver failed';
      console.error('[chat-photo fixture]', detail);
      errors.push(detail);
      response
        .writeHead(500)
        .end(JSON.stringify({ success: false, error: detail }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  page.once('close', () => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Photo receiver has no port');
  await page.route(
    'https://uploads.chat.invalid/chat-photo-*',
    async (route) => {
      const image = uploads.find(
        (upload) => upload.url === route.request().url()
      );
      if (!image) throw new Error('Requested an unknown fixture photo');
      await route.fulfill({ contentType: 'image/jpeg', body: image.bytes });
    }
  );
  await page.route('**/api/social/media', (route) =>
    route.continue({ url: `http://127.0.0.1:${address.port}/upload` })
  );
  return { uploads, errors };
}

export async function chooseChatPhoto(
  page: Page,
  file: Awaited<ReturnType<typeof chatPhotoFile>>
) {
  const choosing = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Attach a photo', exact: true })
    .click();
  const picker = await choosing;
  await expect(
    page.getByRole('menuitem', { name: 'Choose photo', exact: true })
  ).toHaveCount(0);
  await expect(page.getByText('Photo attachment', { exact: true })).toHaveCount(
    0
  );
  await picker.setFiles(file);
}
