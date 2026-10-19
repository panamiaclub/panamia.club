import type { PushMessage } from './types';

// Budgets count UTF-8 bytes after JSON escaping, leaving room below both
// providers' 4096-byte limit for their envelopes and optional metadata.
export const PUSH_FIELD_BYTES = { title: 256, body: 1536, url: 1024 } as const;

const encoder = new TextEncoder();

function truncateJsonString(value: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(JSON.stringify(character)).byteLength - 2;
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

export function boundPushMessage(message: PushMessage): PushMessage {
  const url =
    message.url === undefined
      ? undefined
      : truncateJsonString(message.url, PUSH_FIELD_BYTES.url);

  return {
    ...message,
    title: truncateJsonString(message.title, PUSH_FIELD_BYTES.title),
    body: truncateJsonString(message.body, PUSH_FIELD_BYTES.body),
    // Truncating a route can point at a different resource or a 404.
    ...(url !== undefined
      ? { url: url === message.url ? url : '/updates' }
      : {}),
  };
}
