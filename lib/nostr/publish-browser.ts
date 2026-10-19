// Browser-only Nostr publisher: opens a WebSocket to the panamia relay,
// completes NIP-42 AUTH using the caller's nsec, sends one EVENT, and
// closes. Used by /r enrollment to seed a kind 0 metadata event so other
// clients (e.g. web.nostrord.com) display the user's screenname instead of
// truncated hex. Server-side use is not supported — Node has no global
// WebSocket and we do not want to ship `ws` to the browser bundle.
import { signEvent, type UnsignedEvent } from './sign';

export interface PublishOptions {
  relayUrl?: string;
  timeoutMs?: number;
}

export interface PublishResult {
  accepted: boolean;
  reason: string;
}

const DEFAULT_RELAY_URL = 'wss://relay.panamia.club';
const DEFAULT_TIMEOUT_MS = 10_000;

export async function publishWithAuth(
  skHex: string,
  partial: UnsignedEvent,
  opts: PublishOptions = {}
): Promise<PublishResult> {
  const relayUrl = opts.relayUrl ?? DEFAULT_RELAY_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ws = new WebSocket(relayUrl);
  const event = signEvent(skHex, partial);

  return await new Promise<PublishResult>((resolve, reject) => {
    let authed = false;
    let sent = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('publishWithAuth timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
    }

    ws.addEventListener('error', () => {
      cleanup();
      reject(new Error('relay websocket error'));
    });

    ws.addEventListener('message', (e) => {
      let msg: unknown;
      try {
        msg = JSON.parse(typeof e.data === 'string' ? e.data : '');
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;

      // ["AUTH", challenge] — sign a kind 22242 and send it back.
      if (msg[0] === 'AUTH' && typeof msg[1] === 'string' && !authed) {
        const authEv = signEvent(skHex, {
          kind: 22242,
          tags: [
            ['relay', relayUrl],
            ['challenge', msg[1]],
          ],
          content: '',
        });
        ws.send(JSON.stringify(['AUTH', authEv]));
        return;
      }

      // ["OK", id, accepted, reason]
      if (msg[0] === 'OK' && typeof msg[1] === 'string') {
        // First OK is for our AUTH event; second is for the actual EVENT.
        if (!authed) {
          if (msg[2] === true) {
            authed = true;
            if (!sent) {
              sent = true;
              ws.send(JSON.stringify(['EVENT', event]));
            }
          } else {
            cleanup();
            reject(new Error(`AUTH rejected: ${String(msg[3] ?? '')}`));
          }
          return;
        }
        if (msg[1] === event.id) {
          cleanup();
          resolve({
            accepted: msg[2] === true,
            reason: typeof msg[3] === 'string' ? msg[3] : '',
          });
        }
      }
    });
  });
}
