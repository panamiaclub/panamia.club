import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import WebSocket from 'ws';
import {
  signEvent,
  type NostrEvent,
  type UnsignedEvent,
} from '../lib/nostr/sign';

export { signEvent };
export type { NostrEvent };
export type Partial = UnsignedEvent;

export const RELAY_URL = process.env.RELAY_URL ?? 'wss://relay.panamia.club';

export function randomSecretKey(): string {
  return bytesToHex(schnorr.utils.randomSecretKey());
}

// Cloudflare's bot heuristics 403 the WS upgrade for clients without a
// User-Agent (notably GitHub-runner IPs hitting `ws`'s default empty UA).
// Set an honest-looking UA so the upgrade reaches the Worker.
const WS_OPTIONS = {
  headers: { 'User-Agent': 'panamia-relay-tests/1.0 (+protocol smoke test)' },
};

// Open a connection, complete NIP-42 AUTH, resolve to the open WebSocket.
// Rejects on AUTH failure or 10s timeout.
export function connectAndAuth(skHex: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY_URL, WS_OPTIONS);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('connectAndAuth timeout'));
    }, 10_000);

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'AUTH' && typeof msg[1] === 'string') {
        const challenge = msg[1];
        const ev = signEvent(skHex, {
          kind: 22242,
          tags: [
            ['relay', RELAY_URL],
            ['challenge', challenge],
          ],
          content: '',
        });
        ws.send(JSON.stringify(['AUTH', ev]));
      } else if (msg[0] === 'OK' && msg[2] === true) {
        clearTimeout(timer);
        // Detach the auth listener so callers get a clean message stream.
        ws.removeAllListeners('message');
        resolve(ws);
      } else if (msg[0] === 'OK' && msg[2] === false) {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`AUTH rejected: ${msg[3]}`));
      }
    });
  });
}

export interface PublishResult {
  accepted: boolean;
  reason: string;
}

// Publish a single event and resolve with the relay's OK response.
export function publish(
  ws: WebSocket,
  skHex: string,
  partial: UnsignedEvent
): Promise<PublishResult> {
  return new Promise((resolve, reject) => {
    const ev = signEvent(skHex, partial);
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      reject(new Error('publish timeout'));
    }, 8_000);

    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'OK' && msg[1] === ev.id) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve({ accepted: msg[2], reason: msg[3] });
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify(['EVENT', ev]));
  });
}

export interface ReqResult {
  closed: boolean;
  reason?: string;
  events: NostrEvent[];
}

// Run a REQ subscription to completion (EOSE or CLOSED) and resolve.
export function request(
  ws: WebSocket,
  subId: string,
  filter: Record<string, unknown>
): Promise<ReqResult> {
  return new Promise((resolve, reject) => {
    const events: NostrEvent[] = [];
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      reject(new Error('request timeout'));
    }, 8_000);

    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT' && msg[1] === subId) {
        events.push(msg[2]);
      } else if (msg[0] === 'EOSE' && msg[1] === subId) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve({ closed: false, events });
      } else if (msg[0] === 'CLOSED' && msg[1] === subId) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve({ closed: true, reason: msg[2], events });
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify(['REQ', subId, filter]));
  });
}
