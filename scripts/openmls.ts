import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parse as parseToml } from 'smol-toml';
import { format, resolveConfig } from 'prettier';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../crypto/openmls/', import.meta.url));
const pins = z
  .object({
    engine: z.literal('openmls-0.9.2'),
    crateVersion: z.literal('0.9.2'),
    crateSha256: z.string().regex(/^[0-9a-f]{64}$/),
    sourceRevision: z.string().regex(/^[0-9a-f]{40}$/),
    providerRevision: z.string().regex(/^[0-9a-f]{40}$/),
    rustVersion: z.string(),
    wasmBindgenVersion: z.string(),
    cargoAuditVersion: z.string(),
    cargoDenyVersion: z.string(),
  })
  .parse(JSON.parse(readFileSync(path.join(root, 'engine-lock.json'), 'utf8')));

function run(command: string, args: string[], capture = false): string {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '4',
    },
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      `${command} is unavailable. Install Rust ${pins.rustVersion}, its wasm32 target, ` +
        `and wasm-bindgen-cli ${pins.wasmBindgenVersion}.`,
      { cause: result.error }
    );
  }
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}).`);
  }
  return result.stdout ?? '';
}

function validateEngine() {
  const rust = run('rustc', ['--version'], true).trim();
  if (rust.split(' ')[1] !== pins.rustVersion) {
    throw new Error(`Expected Rust ${pins.rustVersion}; found ${rust}.`);
  }
  const host = /^host: (\S+)$/m.exec(run('rustc', ['-vV'], true))?.[1];
  if (!host) throw new Error('Cannot determine the native Rust target.');
  const metadata = z
    .object({
      packages: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          version: z.string(),
          source: z.string().nullable(),
          manifest_path: z.string(),
        })
      ),
      resolve: z.object({
        nodes: z.array(
          z.object({ id: z.string(), features: z.array(z.string()) })
        ),
      }),
    })
    .parse(
      JSON.parse(
        run(
          'cargo',
          [
            'metadata',
            '--locked',
            '--format-version',
            '1',
            '--filter-platform',
            'wasm32-unknown-unknown',
          ],
          true
        )
      )
    );
  const core = metadata.packages.find((pkg) => pkg.name === 'openmls');
  if (
    !core ||
    core.version !== pins.crateVersion ||
    core.source !== 'registry+https://github.com/rust-lang/crates.io-index'
  ) {
    throw new Error('OpenMLS must resolve to the pinned crates.io release.');
  }
  const lock = z
    .object({
      package: z.array(
        z.object({
          name: z.string(),
          version: z.string(),
          source: z.string().optional(),
          checksum: z.string().optional(),
        })
      ),
    })
    .parse(parseToml(readFileSync(path.join(root, 'Cargo.lock'), 'utf8')));
  const locked = lock.package.filter((pkg) => pkg.name === 'openmls');
  if (
    locked.length !== 1 ||
    locked[0].version !== pins.crateVersion ||
    locked[0].source !== core.source ||
    locked[0].checksum !== pins.crateSha256
  )
    throw new Error(
      'OpenMLS Cargo.lock entry differs from the verified release.'
    );
  const providerSource =
    `git+https://github.com/openmls/openmls?rev=${pins.providerRevision}` +
    `#${pins.providerRevision}`;
  for (const name of [
    'openmls_basic_credential',
    'openmls_rust_crypto',
    'openmls_traits',
    'openmls_memory_storage',
  ]) {
    const packages = metadata.packages.filter((pkg) => pkg.name === name);
    if (
      packages.length !== 1 ||
      packages[0].version !== '0.6.0' ||
      packages[0].source !== providerSource
    )
      throw new Error(
        `${name} must use the pinned upstream provider revision.`
      );
    const active = metadata.resolve.nodes.find(
      (node) => node.id === packages[0].id
    );
    const allowed = name === 'openmls_traits' ? ['default'] : [];
    if (
      !active ||
      active.features.some((feature) => !allowed.includes(feature))
    )
      throw new Error(`${name} has unexpected provider features.`);
  }
  const features = metadata.resolve.nodes.find(
    (node) => node.id === core.id
  )?.features;
  if (!features || features.length !== 1 || features[0] !== 'js') {
    throw new Error(
      'Unexpected OpenMLS features: debug, unchecked, test and draft features are forbidden.'
    );
  }
  return { rust, host, features };
}

const mode = process.argv[2] ?? 'build';
const evidence = validateEngine();
if (mode === 'test') {
  run('cargo', ['test', '--locked']);
} else if (mode === 'check') {
  run('cargo', ['fmt', '--check']);
  run('cargo', ['clippy', '--locked', '--all-targets', '--', '-D', 'warnings']);
} else if (mode === 'audit') {
  const version = run('cargo-audit', ['--version'], true).trim();
  if (version !== `cargo-audit ${pins.cargoAuditVersion}`) {
    throw new Error(
      `Expected cargo-audit ${pins.cargoAuditVersion}; found ${version}.`
    );
  }
  const denyVersion = run('cargo-deny', ['--version'], true).trim();
  if (denyVersion !== `cargo-deny ${pins.cargoDenyVersion}`) {
    throw new Error(
      `Expected cargo-deny ${pins.cargoDenyVersion}; found ${denyVersion}.`
    );
  }
  // Keep whole-lockfile notices visible; enforce every advisory on built graphs.
  run('cargo', ['audit', '--file', 'Cargo.lock']);
  for (const target of new Set(['wasm32-unknown-unknown', evidence.host])) {
    run('cargo', [
      'deny',
      '--locked',
      '--target',
      target,
      'check',
      'advisories',
      '--deny',
      'warnings',
    ]);
  }
} else if (mode === 'build') {
  const version = run('wasm-bindgen', ['--version'], true).trim();
  if (version !== `wasm-bindgen ${pins.wasmBindgenVersion}`) {
    throw new Error(
      `Expected wasm-bindgen ${pins.wasmBindgenVersion}; found ${version}.`
    );
  }
  run('cargo', [
    'build',
    '--locked',
    '--release',
    '--target',
    'wasm32-unknown-unknown',
  ]);
  run('wasm-bindgen', [
    path.join(
      'target',
      'wasm32-unknown-unknown',
      'release',
      'pana_openmls.wasm'
    ),
    '--target',
    'web',
    '--out-dir',
    'pkg',
    '--out-name',
    'pana_openmls',
  ]);
  const declarations = path.join(root, 'pkg', 'pana_openmls.d.ts');
  const linter = new ESLint({ fix: true });
  const [linted] = await linter.lintText(readFileSync(declarations, 'utf8'), {
    filePath: declarations,
  });
  if (!linted) {
    throw new Error('No lint result for generated OpenMLS declarations.');
  }
  if (linted.errorCount || linted.warningCount) {
    const formatter = await linter.loadFormatter('stylish');
    throw new Error(
      `Generated OpenMLS declarations fail linting:\n${await formatter.format([linted])}`
    );
  }
  writeFileSync(
    declarations,
    await format(linted.output ?? readFileSync(declarations, 'utf8'), {
      ...(await resolveConfig(declarations)),
      filepath: declarations,
    })
  );
  const wasm = readFileSync(path.join(root, 'pkg', 'pana_openmls_bg.wasm'));
  writeFileSync(
    path.join(root, 'pkg', 'build-info.json'),
    JSON.stringify(
      {
        engine: pins.engine,
        sourceRevision: pins.sourceRevision,
        providerRevision: pins.providerRevision,
        wasmSha256: createHash('sha256').update(wasm).digest('hex'),
        wasmBytes: wasm.length,
        cargoLockSha256: createHash('sha256')
          .update(readFileSync(path.join(root, 'Cargo.lock')))
          .digest('hex'),
        bridgeSourceSha256: createHash('sha256')
          .update(readFileSync(path.join(root, 'src', 'lib.rs')))
          .digest('hex'),
        manifestSha256: createHash('sha256')
          .update(readFileSync(path.join(root, 'Cargo.toml')))
          .digest('hex'),
        bindingsSha256: createHash('sha256')
          .update(readFileSync(path.join(root, 'pkg', 'pana_openmls.js')))
          .digest('hex'),
        wasmBindgen: version,
        ...evidence,
      },
      null,
      2
    ) + '\n'
  );
} else {
  throw new Error('Use openmls.ts build, test, check, or audit.');
}
