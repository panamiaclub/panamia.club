// Prove relay.panamia.club accepts and serves kind:445 (MLS group event)
// over an unauthenticated socket — i.e. the AUTH carve-out works end to
// end. Publishes a synthetic 445 with a unique h-tag, then reads it back
// on a separate unauthenticated connection.
import WebSocket from 'ws';
import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { signEvent } from '../lib/nostr/sign';

const RELAY = 'wss://relay.panamia.club';
const WS_OPTIONS = {
  headers: { 'User-Agent': 'panamia-mls-capability-probe/1.0' },
};

function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY, WS_OPTIONS);
    const t = setTimeout(() => reject(new Error('open timeout')), 5_000);
    ws.once('open', () => {
      clearTimeout(t);
      resolve(ws);
    });
    ws.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function send(ws: WebSocket, msg: unknown[]): void {
  ws.send(JSON.stringify(msg));
}

async function main() {
  const sk = bytesToHex(schnorr.utils.randomSecretKey());
  const h = bytesToHex(schnorr.utils.randomSecretKey()).slice(0, 64); // random h-tag

  // --- Publish leg: unauthenticated socket, send kind:445 ---
  const pub = await openSocket();
  const ev = signEvent(sk, {
    kind: 445,
    tags: [
      ['h', h],
      ['encoding', 'base64'],
    ],
    content: 'capability-probe',
  });

  const pubResult: { accepted: boolean; reason: string } = await new Promise(
    (resolve, reject) => {
      const t = setTimeout(() => reject(new Error('publish timeout')), 5_000);
      pub.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // Ignore the AUTH challenge — we intentionally don't answer it.
        if (msg[0] === 'OK' && msg[1] === ev.id) {
          clearTimeout(t);
          resolve({ accepted: msg[2], reason: msg[3] ?? '' });
        }
      });
      send(pub, ['EVENT', ev]);
    }
  );
  pub.close();

  console.log(
    `publish: accepted=${pubResult.accepted} reason="${pubResult.reason}" id=${ev.id} h=${h}`
  );
  if (!pubResult.accepted) process.exit(1);

  // Give D1 a moment to settle, then read on a fresh unauthenticated socket.
  await new Promise((r) => setTimeout(r, 500));

  const sub = await openSocket();
  const subId = 'probe';
  const reqResult: { closed: boolean; reason: string; events: any[] } =
    await new Promise((resolve, reject) => {
      const events: any[] = [];
      const t = setTimeout(() => reject(new Error('req timeout')), 5_000);
      sub.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'EVENT' && msg[1] === subId) events.push(msg[2]);
        else if (msg[0] === 'EOSE' && msg[1] === subId) {
          clearTimeout(t);
          resolve({ closed: false, reason: '', events });
        } else if (msg[0] === 'CLOSED' && msg[1] === subId) {
          clearTimeout(t);
          resolve({ closed: true, reason: msg[2] ?? '', events });
        }
      });
      send(sub, ['REQ', subId, { kinds: [445], '#h': [h] }]);
    });
  sub.close();

  if (reqResult.closed) {
    console.log(`req:     CLOSED reason="${reqResult.reason}"`);
    process.exit(1);
  }
  const hit = reqResult.events.find((e: any) => e.id === ev.id);
  console.log(
    `req:     received ${reqResult.events.length} event(s); match=${hit ? 'yes' : 'no'}`
  );
  if (!hit) process.exit(1);
  console.log('PASS — relay.panamia.club can carry MLS group traffic alone.');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
