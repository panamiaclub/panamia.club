import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { z } from 'zod';

export function encryptionEnginePlugin(): Plugin {
  const id = 'virtual:pana-openmls';
  const resolved = '\0' + id;
  const root = path.resolve('crypto/openmls');
  const glue = path.join(root, 'pkg', 'pana_openmls.js');
  const wasm = path.join(root, 'pkg', 'pana_openmls_bg.wasm');
  return {
    name: 'pana-encryption-engine',
    enforce: 'pre',
    resolveId(value) {
      if (value === id) return resolved;
      if (value === id + '/bindings') return glue;
    },
    load(value) {
      if (value !== resolved) return;
      if (!existsSync(glue) && !existsSync(wasm)) {
        if (process.env.CHAT_E2EE_ENABLED === '1')
          this.error(
            'An encryption-capable build requires pinned OpenMLS artifacts. Run yarn openmls:build before yarn build:encrypted.'
          );
        return `
          export const engineAvailable = false;
          class UnavailableEngine { constructor() { throw new Error("This build has no encryption engine. Update the client; plaintext fallback is forbidden."); } }
          export { UnavailableEngine as MlsDevice, UnavailableEngine as ProfileSigningKey };
          export default async function() { throw new Error("Build the pinned encryption engine before enabling encrypted messaging."); }
        `;
      }
      if (
        !existsSync(glue) ||
        !existsSync(wasm) ||
        !existsSync(path.join(root, 'pkg', 'build-info.json'))
      )
        this.error(
          'Incomplete OpenMLS artifacts. Run yarn openmls:build; no replacement engine is permitted.'
        );
      const info = z
        .record(z.string(), z.unknown())
        .parse(
          JSON.parse(
            readFileSync(path.join(root, 'pkg', 'build-info.json'), 'utf8')
          )
        );
      const pins = z
        .object({
          engine: z.string(),
          sourceRevision: z.string(),
          providerRevision: z.string(),
        })
        .parse(
          JSON.parse(readFileSync(path.join(root, 'engine-lock.json'), 'utf8'))
        );
      for (const field of [
        'engine',
        'sourceRevision',
        'providerRevision',
      ] as const) {
        if (info[field] !== pins[field])
          this.error(
            'Stale OpenMLS engine provenance. Run yarn openmls:build.'
          );
      }
      for (const [file, field] of [
        ['Cargo.lock', 'cargoLockSha256'],
        ['Cargo.toml', 'manifestSha256'],
        ['src/lib.rs', 'bridgeSourceSha256'],
        ['pkg/pana_openmls.js', 'bindingsSha256'],
        ['pkg/pana_openmls_bg.wasm', 'wasmSha256'],
      ]) {
        const digest = createHash('sha256')
          .update(readFileSync(path.join(root, file)))
          .digest('hex');
        if (digest !== info[field])
          this.error(
            `Stale OpenMLS artifact: ${file}. Run yarn openmls:build.`
          );
      }
      return `export const engineAvailable = true;
        export { default, MlsDevice, ProfileSigningKey } from "${id}/bindings";`;
    },
  };
}
