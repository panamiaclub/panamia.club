import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import config from '../capacitor.config';
import { MOBILE_APP_ID } from '../lib/mobile/app-identity';
import { DEFAULT_ROOT_DOMAIN } from '../lib/panaverse/root-domain';

const ROOT = resolve(import.meta.dirname, '..');
const IOS_PROJECT = join(ROOT, 'mobile', 'ios', 'App');
const require = createRequire(import.meta.url);

export interface IosBuildOptions {
  versionName: string;
  buildNumber: string;
  teamId: string;
  provisioningProfile?: string;
}

export function parseIosBuildOptions(
  args: string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): IosBuildOptions {
  const allowed = new Set([
    '--version-name',
    '--build-number',
    '--team-id',
    '--provisioning-profile',
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    if (!value || value.startsWith('-'))
      throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }

  const versionName = values.get('--version-name') ?? '';
  const buildNumber = values.get('--build-number') ?? '';
  const teamId = (values.get('--team-id') ?? env.APPLE_TEAM_ID ?? '').trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(versionName))
    throw new Error(
      '--version-name must be an App Store version such as 1.0.0.'
    );
  if (!/^[1-9]\d{0,3}$/.test(buildNumber))
    throw new Error(
      '--build-number must be an increasing integer from 1 to 9999.'
    );
  if (!/^[A-Z0-9]{10}$/.test(teamId))
    throw new Error(
      'Set APPLE_TEAM_ID or --team-id to your 10-character Apple Team ID.'
    );

  return {
    versionName,
    buildNumber,
    teamId,
    provisioningProfile: values.get('--provisioning-profile'),
  };
}

export function assertIosProductionServer(url: string | undefined): void {
  if (
    !url ||
    (url !== `https://${DEFAULT_ROOT_DOMAIN}` &&
      url !== `https://${DEFAULT_ROOT_DOMAIN}/`)
  ) {
    throw new Error(
      `iOS releases must load https://${DEFAULT_ROOT_DOMAIN}. Remove the preview CAPACITOR_SERVER_URL override.`
    );
  }
}

export function hasAppleAppAssociation(
  value: unknown,
  teamId: string
): boolean {
  if (typeof value !== 'object' || value === null || !('applinks' in value))
    return false;
  const links = value.applinks;
  if (typeof links !== 'object' || links === null || !('details' in links))
    return false;
  if (!Array.isArray(links.details)) return false;
  const identifier = `${teamId}.${MOBILE_APP_ID}`;
  return links.details.some(
    (detail: unknown) =>
      typeof detail === 'object' &&
      detail !== null &&
      (('appIDs' in detail &&
        Array.isArray(detail.appIDs) &&
        detail.appIDs.includes(identifier)) ||
        ('appID' in detail && detail.appID === identifier))
  );
}

export function iosExportOptions(options: IosBuildOptions): string {
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      switch (character) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&apos;';
      }
    });
  const profile = options.provisioningProfile;
  const manual = profile !== undefined;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>teamID</key><string>${escape(options.teamId)}</string>
<key>signingStyle</key><string>${manual ? 'manual' : 'automatic'}</string>
<key>manageAppVersionAndBuildNumber</key><false/>
<key>uploadSymbols</key><true/>
${
  profile !== undefined
    ? `<key>signingCertificate</key><string>Apple Distribution</string>
<key>provisioningProfiles</key><dict>
<key>${MOBILE_APP_ID}</key><string>${escape(profile)}</string>
</dict>`
    : ''
}
</dict></plist>
`;
}

async function checkUniversalLinks(teamId: string): Promise<void> {
  for (const host of [DEFAULT_ROOT_DOMAIN, `social.${DEFAULT_ROOT_DOMAIN}`]) {
    const url = `https://${host}/.well-known/apple-app-site-association`;
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    }).catch((cause: unknown) => {
      throw new Error(
        `Could not verify iOS Universal Links at ${url}. Check HTTPS, DNS, and redirects.`,
        { cause }
      );
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    ) {
      throw new Error(
        `${url} must return JSON without a redirect (HTTP ${response.status}).`
      );
    }
    const association: unknown = await response.json();
    if (!hasAppleAppAssociation(association, teamId)) {
      throw new Error(
        `${url} does not authorize ${teamId}.${MOBILE_APP_ID}. Set APPLE_APP_TEAM_ID on the website deployment first.`
      );
    }
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: yarn mobile:bundle:ios --version-name 1.0.0 --build-number 1 --team-id ABCDE12345 [--provisioning-profile UUID]\n\nRequires macOS, Xcode, and Apple signing credentials. See docs/IOS.md.'
    );
    return;
  }
  const options = parseIosBuildOptions(process.argv.slice(2));
  assertIosProductionServer(config.server?.url);
  if (platform() !== 'darwin') {
    throw new Error(
      'iOS release builds require macOS with Xcode. From Windows, use the iOS Release GitHub Actions workflow.'
    );
  }
  await checkUniversalLinks(options.teamId);

  const output = join(
    IOS_PROJECT,
    'build',
    'release',
    `${options.versionName}-${options.buildNumber}`
  );
  if (existsSync(output))
    throw new Error(
      `Release output already exists: ${output}. Use a fresh build number or move the previous output before retrying.`
    );
  mkdirSync(output, { recursive: true });
  const archive = join(output, 'PanaMia.xcarchive');
  const exported = join(output, 'export');
  const exportOptions = join(output, 'ExportOptions.plist');
  writeFileSync(exportOptions, iosExportOptions(options));

  execFileSync(
    process.execPath,
    [require.resolve('@capacitor/cli/bin/capacitor'), 'sync', 'ios'],
    { cwd: ROOT, stdio: 'inherit' }
  );
  const signing = options.provisioningProfile
    ? [
        'CODE_SIGN_STYLE=Manual',
        'CODE_SIGN_IDENTITY=Apple Distribution',
        `PROVISIONING_PROFILE_SPECIFIER=${options.provisioningProfile}`,
      ]
    : ['CODE_SIGN_STYLE=Automatic', '-allowProvisioningUpdates'];

  execFileSync(
    'xcodebuild',
    [
      '-project',
      join(IOS_PROJECT, 'App.xcodeproj'),
      '-scheme',
      'App',
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archive,
      '-derivedDataPath',
      join(output, 'DerivedData'),
      '-quiet',
      `DEVELOPMENT_TEAM=${options.teamId}`,
      `MARKETING_VERSION=${options.versionName}`,
      `CURRENT_PROJECT_VERSION=${options.buildNumber}`,
      ...signing,
      'archive',
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );
  execFileSync(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath',
      archive,
      '-exportPath',
      exported,
      '-exportOptionsPlist',
      exportOptions,
      ...(options.provisioningProfile ? [] : ['-allowProvisioningUpdates']),
      '-quiet',
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );
  const packages = readdirSync(exported).filter((file) =>
    file.endsWith('.ipa')
  );
  if (packages.length !== 1)
    throw new Error(
      `Expected exactly one exported IPA in ${exported}; found ${packages.length}.`
    );
  console.log(`\nApp Store package: ${join(exported, packages[0])}`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch((error: unknown) => {
    console.error('iOS release failed:', error);
    process.exitCode = 1;
  });
}
