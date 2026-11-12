import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function createStagingSnapshot(
  repository: string,
  directory: string,
  workerConfig: Record<string, unknown>
) {
  const target = path.join(directory, 'app');
  await mkdir(target);
  const protectedVendor = path.join('external', 'activities.next');
  await mkdir(path.join(target, 'external'), { recursive: true });
  await symlink(
    path.join(repository, protectedVendor),
    path.join(target, protectedVendor),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  const { stdout } = await exec(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: repository, maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  );
  const fingerprints: Record<string, string> = {};
  for (const gitPath of new Set(stdout.split('\0').filter(Boolean))) {
    const relative = gitPath.split('/').join(path.sep);
    if (
      relative === protectedVendor ||
      relative.startsWith(`${protectedVendor}${path.sep}`)
    )
      continue;
    const leaf = path.basename(relative);
    if (leaf.startsWith('.env') || leaf.startsWith('.dev.vars')) continue;
    const source = path.join(repository, relative);
    const destination = path.join(target, relative);
    const stat = await lstat(source);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to copy an unreviewed source symlink: ${gitPath}`
      );
    }
    await mkdir(path.dirname(destination), { recursive: true });
    if (stat.isDirectory()) {
      await symlink(
        source,
        destination,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } else {
      await copyFile(source, destination);
      fingerprints[gitPath] = createHash('sha256')
        .update(await readFile(source))
        .digest('hex');
    }
  }
  await symlink(
    path.join(repository, 'node_modules'),
    path.join(target, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  const artifacts = path.join('crypto', 'openmls', 'pkg');
  await mkdir(path.join(target, artifacts), { recursive: true });
  for (const entry of await readdir(path.join(repository, artifacts))) {
    await copyFile(
      path.join(repository, artifacts, entry),
      path.join(target, artifacts, entry)
    );
  }
  await writeFile(
    path.join(target, 'wrangler.jsonc'),
    JSON.stringify(workerConfig, null, 2),
    { mode: 0o600 }
  );
  await writeFile(
    path.join(directory, 'source-hashes.json'),
    JSON.stringify(fingerprints, null, 2)
  );
  return target;
}
