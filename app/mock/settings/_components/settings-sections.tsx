'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Fingerprint,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  LICENSE_OPTIONS,
  MARKETING_CHANNELS,
  MOCK_ACCOUNT,
  MOCK_MARKETING_RECORD,
  SCREENNAME_CONSEQUENCES,
  SETTINGS_SECTIONS,
  TAKEN_SCREENNAMES,
  type LicenseOption,
  type SectionId,
  type SettingsSection,
} from '../_data/mock-settings';
import {
  Consequence,
  OnOff,
  ScopeChip,
  SettingsCard,
  SettingsRow,
} from './setting-primitives';

function sectionFor(id: SectionId): SettingsSection {
  const section = SETTINGS_SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`No settings section named "${id}".`);
  return section;
}

/* Every section is headed the same way: what it is, where it applies, and one
   sentence of what it is for. The scope chip is never omitted — see
   ScopeChip's note on why an optional one would be worse than none. */
function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const section = sectionFor(id);
  return (
    <section id={id} className="settings-section">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-xl font-black tracking-tight">
            {section.heading}
          </h2>
          <ScopeChip scope={section.scope} />
        </div>
        <p className="settings-note mt-1.5 max-w-2xl">{section.lede}</p>
      </header>
      {children}
    </section>
  );
}

/* Which controls save on their own and which wait for the save bar.
 *
 * The live page has one "Update" button covering three fields, while the
 * licence picker and every marketing toggle write immediately — and nothing
 * on screen distinguishes them. So a member can change their licence, decide
 * against it, navigate away without pressing Update, and be wrong about what
 * they just did. Saying it per control costs one line and removes the guess. */
function AutoSaved({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  if (state === 'idle') {
    return <span className="settings-note">Saves on its own</span>;
  }
  if (state === 'saving') {
    return (
      <span className="settings-note inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Saving
      </span>
    );
  }
  return (
    <span className="text-pana-indigo inline-flex items-center gap-1.5 text-[13px] font-extrabold">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      Saved
    </span>
  );
}

/* ---- Identity ----------------------------------------------------------- */

type NameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function IdentitySection({
  name,
  onName,
  screenname,
  onScreenname,
}: {
  name: string;
  onName: (value: string) => void;
  screenname: string;
  onScreenname: (value: string) => void;
}) {
  const [status, setStatus] = useState<NameState>('idle');
  const changed = screenname !== MOCK_ACCOUNT.screenname;

  /* Mirrors the live debounce in app/account/user/edit/page.tsx, minus the
     fetch. The states are what matters to the design: the field has to be able
     to say "checking" without the layout moving when it resolves. */
  useEffect(() => {
    if (!changed) {
      setStatus('idle');
      return;
    }
    if (!/^[a-zA-Z0-9_-]*$/.test(screenname)) {
      setStatus('invalid');
      return;
    }
    if (screenname.length < 3) {
      setStatus('invalid');
      return;
    }

    setStatus('checking');
    const timer = setTimeout(() => {
      setStatus(
        TAKEN_SCREENNAMES.includes(screenname.toLowerCase())
          ? 'taken'
          : 'available'
      );
    }, 550);
    return () => clearTimeout(timer);
  }, [screenname, changed]);

  const inputState =
    status === 'available'
      ? 'available'
      : status === 'taken' || status === 'invalid'
        ? 'taken'
        : undefined;

  /* The handle is not a field. It is the screenname with a domain on it, so it
     renders as a derived value directly beneath — which is the only way a
     member finds out, before they type, that renaming here renames them across
     the fediverse. */
  const projectedHandle = `@${screenname || MOCK_ACCOUNT.screenname}@panamia.club`;

  return (
    <Section id="identity">
      <SettingsCard>
        <SettingsRow
          label="Name"
          htmlFor="settings-name"
          note="Optional. Shown next to your screenname on everything you contribute."
        >
          <input
            id="settings-name"
            className="settings-input"
            value={name}
            maxLength={60}
            autoComplete="name"
            onChange={(event) => onName(event.target.value)}
          />
        </SettingsRow>

        <SettingsRow
          label="Screenname"
          htmlFor="settings-screenname"
          note="3–24 characters. Letters, numbers, underscores, and hyphens."
        >
          <div className="relative">
            <input
              id="settings-screenname"
              className="settings-input pr-10"
              data-state={inputState}
              value={screenname}
              maxLength={24}
              autoComplete="username"
              aria-describedby="settings-screenname-status"
              onChange={(event) => onScreenname(event.target.value)}
            />
            <span className="absolute top-1/2 right-3 -translate-y-1/2">
              {status === 'checking' && (
                <Loader2
                  className="text-pana-ink/40 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {status === 'available' && (
                <Check className="text-pana-indigo h-4 w-4" aria-hidden="true" />
              )}
              {(status === 'taken' || status === 'invalid') && (
                <X className="text-pana-red h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </div>

          {/* A fixed slot, so the card does not grow and shrink under the
              cursor as the check resolves. */}
          <p
            id="settings-screenname-status"
            className="settings-note mt-2 min-h-[1.25rem]"
            aria-live="polite"
          >
            {status === 'available' && (
              <span className="text-pana-indigo font-extrabold">
                @{screenname} is free.
              </span>
            )}
            {status === 'taken' && (
              <span className="text-pana-red-deep font-extrabold">
                @{screenname} is taken.
              </span>
            )}
            {status === 'invalid' && (
              <span className="text-pana-red-deep font-extrabold">
                Too short, or uses a character that is not allowed.
              </span>
            )}
            {status === 'checking' && 'Checking…'}
            {status === 'idle' &&
              `Last changed ${MOCK_ACCOUNT.screennameChangedAt}. You can change it again now.`}
          </p>

          <div className="border-pana-ink/10 mt-3 border-t pt-3">
            <span className="rail-heading">Your handle becomes</span>
            <p className="settings-readonly mt-1.5">
              <Fingerprint
                className="text-pana-ink/45 h-4 w-4 flex-none"
                aria-hidden="true"
              />
              <span className="truncate">{projectedHandle}</span>
            </p>
            <p className="settings-note mt-1.5">
              Built from your screenname. This is the address other fediverse
              servers know you by, and it is the same string on Pana Mia and
              Pana Social.
            </p>
          </div>

          {/* Shown the moment the field differs, not after the member commits.
              This block is the reason the section exists in this shape. */}
          {changed && status !== 'invalid' && (
            <div className="mt-3">
              <Consequence
                title="Changing your screenname is not free"
                points={SCREENNAME_CONSEQUENCES}
              />
            </div>
          )}
        </SettingsRow>

        {/* The rest of the profile, named so members stop looking for it here.
            Bio and links are the next two things people arrive on this page
            hoping to change. */}
        <SettingsRow
          label="Your public profile"
          note="Your bio, links, categories, and the location shown on your listing are part of your profile, and are edited together in one place."
          control={
            <Link
              href="/account/profile/edit"
              className="settings-btn"
              data-variant="quiet"
            >
              Edit profile
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      </SettingsCard>
    </Section>
  );
}

/* ---- Sign-in ------------------------------------------------------------ */

export function SigninSection() {
  const [changingEmail, setChangingEmail] = useState(false);

  return (
    <Section id="signin">
      <SettingsCard>
        <SettingsRow
          label="Email"
          note="Private. Never shown to other members, and never printed on anything you publish."
          control={
            <button
              type="button"
              className="settings-btn"
              data-variant="quiet"
              onClick={() => setChangingEmail((open) => !open)}
            >
              {changingEmail ? 'Cancel' : 'Change email'}
            </button>
          }
        >
          <p className="settings-readonly">
            <BadgeCheck
              className="text-pana-indigo h-4 w-4 flex-none"
              aria-hidden="true"
            />
            <span className="truncate">{MOCK_ACCOUNT.email}</span>
            <span className="identity-pill ml-auto" data-tone="verified">
              Verified
            </span>
          </p>

          {changingEmail && (
            <div className="border-pana-ink/10 mt-3 border-t pt-3">
              <label className="rail-heading" htmlFor="settings-new-email">
                New email address
              </label>
              <input
                id="settings-new-email"
                type="email"
                className="settings-input mt-1.5"
                placeholder="you@example.com"
              />
              <div className="mt-3">
                <Consequence
                  title="You will need to confirm both addresses"
                  points={[
                    'A verification link goes to the new address. Nothing changes until you open it.',
                    'Your current address stays signed in until the new one is confirmed.',
                    'Everything on the account — posts, articles, listings, keys — comes with you.',
                  ]}
                />
              </div>
              <button type="button" className="settings-btn mt-3">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                Send verification link
              </button>
            </div>
          )}
        </SettingsRow>

        {/* Key rotation is genuinely advanced — but "advanced" is a property of
            this one control, so it is said here, on it, rather than used as the
            name of a drawer holding four unrelated things. */}
        <SettingsRow
          label="Nostr keys"
          note={
            <>
              Your posts are signed with these. Rotating them issues a new
              keypair and republishes your profile so other servers pick it up.
              Do this if you think your key has been exposed.
            </>
          }
          control={
            <button type="button" className="settings-btn" data-variant="quiet">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Rotate keys
            </button>
          }
        >
          <p className="settings-readonly font-mono text-[13px]">
            <span className="truncate">npub1q8s…3h7k</span>
            <span className="text-pana-ink/45 ml-auto flex-none text-[11px] font-extrabold tracking-widest uppercase">
              Public key
            </span>
          </p>
        </SettingsRow>
      </SettingsCard>
    </Section>
  );
}

/* ---- Place -------------------------------------------------------------- */

export function PlaceSection({
  zip,
  onZip,
}: {
  zip: string;
  onZip: (value: string) => void;
}) {
  /* Resolved from the ZIP as you type. The live page takes a ZIP and says
     nothing back, so a member who fats-fingers one digit gets a quietly wrong
     directory for months. Echoing the county turns a blind field into a
     confirmation. */
  const county = /^33\d{3}$/.test(zip)
    ? MOCK_ACCOUNT.county
    : /^3\d{4}$/.test(zip)
      ? 'Broward'
      : null;

  return (
    <Section id="place">
      <SettingsCard>
        <SettingsRow
          label="ZIP code"
          htmlFor="settings-zip"
          note="Used to sort the directory and surface events near you. Not shown on your profile, and not shared with other members."
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="settings-zip"
              className="settings-input max-w-[9rem]"
              value={zip}
              maxLength={10}
              inputMode="numeric"
              autoComplete="postal-code"
              onChange={(event) => onZip(event.target.value)}
            />
            <p className="settings-note" aria-live="polite">
              {county ? (
                <>
                  We&apos;ll show you{' '}
                  <span className="text-pana-ink font-extrabold">
                    {county} County
                  </span>{' '}
                  first.
                </>
              ) : (
                'Enter a Florida ZIP code to set your county.'
              )}
            </p>
          </div>
        </SettingsRow>
      </SettingsCard>
    </Section>
  );
}

/* ---- Publishing --------------------------------------------------------- */

export function PublishingSection({
  license,
  onLicense,
  saveState,
}: {
  license: LicenseOption['value'];
  onLicense: (value: LicenseOption['value']) => void;
  saveState: 'idle' | 'saving' | 'saved';
}) {
  return (
    <Section id="publishing">
      <SettingsCard>
        <SettingsRow
          label="Default licence"
          note="Pre-selected when you compose an article or a post. You can override it on any individual piece."
          control={<AutoSaved state={saveState} />}
        >
          <div
            className="mt-1 space-y-2"
            role="radiogroup"
            aria-label="Default publishing licence"
          >
            {LICENSE_OPTIONS.map((option) => {
              const selected = option.value === license;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onLicense(option.value)}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                    selected
                      ? 'border-pana-indigo bg-pana-indigo/8'
                      : 'border-pana-ink/12 hover:border-pana-ink/30 bg-white'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${
                      selected ? 'border-pana-indigo' : 'border-pana-ink/30'
                    }`}
                    aria-hidden="true"
                  >
                    {selected && (
                      <span className="bg-pana-indigo h-2 w-2 rounded-full" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-black tracking-tight">
                        {option.label}
                      </span>
                      <span className="card-flag">{option.spdx}</span>
                    </span>
                    {/* The plain-language line is the point. A member choosing
                        a licence is making a legal decision, and "CC BY-SA 4.0"
                        is not a decision anyone can make from the acronym. */}
                    <span className="settings-note mt-0.5 block">
                      {option.plain}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsCard>
    </Section>
  );
}

/* ---- Messages ----------------------------------------------------------- */

export function MessagesSection({
  channels,
  onChannel,
  onAllOff,
  saveState,
}: {
  channels: Record<string, boolean>;
  onChannel: (key: string, value: boolean) => void;
  onAllOff: () => void;
  saveState: 'idle' | 'saving' | 'saved';
}) {
  const allOff = MARKETING_CHANNELS.every((channel) => !channels[channel.key]);

  return (
    <Section id="messages">
      <SettingsCard>
        {MARKETING_CHANNELS.map((channel) => (
          <SettingsRow
            key={channel.key}
            label={channel.label}
            note={channel.blurb}
            control={
              <OnOff
                label={`${channel.label} messages`}
                value={!!channels[channel.key]}
                onChange={(next) => onChannel(channel.key, next)}
              />
            }
          />
        ))}

        <SettingsRow
          label="Turn everything off"
          note={
            <>
              A complete opt-out of all Pana Mia messages, including
              announcements and news about projects that are not on this site.
              Sign-in links you ask for yourself still arrive.
            </>
          }
          control={
            <button
              type="button"
              className="settings-btn"
              data-variant="danger"
              disabled={allOff}
              onClick={onAllOff}
            >
              {allOff ? 'All channels off' : 'Turn all off'}
            </button>
          }
        />
      </SettingsCard>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AutoSaved state={saveState} />
        <p className="settings-note">
          Changes can take up to 24 hours to take effect.{' '}
          <Link
            href="/legal/privacy#sharing"
            className="text-pana-indigo font-extrabold underline"
          >
            How marketing data is shared
          </Link>
        </p>
      </div>
    </Section>
  );
}

/* ---- Data --------------------------------------------------------------- */

export function DataSection() {
  return (
    <Section id="data">
      <SettingsCard>
        <SettingsRow
          label="Marketing record"
          note="Held in HighLevel, our mailing tool. This is everything in it."
        >
          <dl className="border-pana-ink/10 mt-1 divide-y-2 divide-dashed border-t-2 border-dashed">
            {MOCK_MARKETING_RECORD.map((entry) => (
              <div
                key={entry.label}
                className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2"
              >
                <dt className="settings-note">{entry.label}</dt>
                <dd className="text-[13px] font-extrabold">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </SettingsRow>

        <SettingsRow
          label="Delete your marketing record"
          note="Removes the contact above from HighLevel. Your Pana Mia account, your posts, and your listings are untouched."
          control={
            <button type="button" className="settings-btn" data-variant="danger">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete record
            </button>
          }
        />
      </SettingsCard>

      {/* Account deletion gets its own card rather than a last row in the one
          above, because a rule between two rows is not enough separation
          between "unsubscribe me" and "erase me". */}
      <div className="profile-card settings-danger mt-4 overflow-hidden">
        <SettingsRow
          label="Delete your account"
          note={
            <>
              Permanent. Your posts, articles, listings, images, and keys go
              with it, and your screenname is not released for anyone else to
              take.
            </>
          }
          control={
            <button type="button" className="settings-btn" data-variant="danger">
              Delete account
            </button>
          }
        />
      </div>

      <p className="settings-note mt-3">
        <Link href="/legal/privacy" className="link-arrow text-pana-indigo">
          What we collect and why
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </p>
    </Section>
  );
}
