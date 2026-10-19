'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Sparkles, Undo2 } from 'lucide-react';
import type { MockSurface } from '../../_data/panaverse';
import { SurfaceMasthead } from '../../_components/surface-masthead';
import {
  DEFAULT_LICENSE,
  MARKETING_CHANNELS,
  MOCK_ACCOUNT,
  RESERVED_SETTINGS,
  type LicenseOption,
} from '../_data/mock-settings';
import { SettingsNav } from './settings-nav';
import { AvatarEditor } from './avatar-editor';
import {
  DataSection,
  IdentitySection,
  MessagesSection,
  PlaceSection,
  PublishingSection,
  SigninSection,
} from './settings-sections';

/* Design mock for the account settings page — the live one is
 * /account/user/edit.
 *
 * The page it replaces is two shadcn cards on white: a form headed "Update
 * Your Account Settings", and a second card headed "Advanced Settings" holding
 * an accordion with four unrelated things in it — change your email, your
 * marketing consent, your signing keys, and your publishing licence. It is the
 * one surface a member reaches from both panamia.club and social.panamia.club,
 * and it is the only one that carries no Pana Mia design at all.
 *
 * Three things are wrong with it, and this mock is an argument about each:
 *
 * 1. IT DOES NOT SAY WHERE A SETTING APPLIES. The surface switcher already
 *    promises "Account settings — applies everywhere", and the page never
 *    makes good on it. So the redesign is organised around scope: every group
 *    states it, and the toolbar can flip which masthead the page is wearing to
 *    show that the content underneath does not change. That is the whole claim,
 *    rendered rather than asserted.
 *
 * 2. "ADVANCED" IS NOT A CATEGORY. It describes how nervous we are about a
 *    control, not what the control is for — which is how a marketing-consent
 *    setting with legal weight ended up collapsed in the same drawer as a key
 *    rotation. Here the accordion is gone and the page is six named sections a
 *    member can scan from the nav without opening anything.
 *
 * 3. CONSEQUENCES ARRIVE TOO LATE. Changing a screenname deletes every post and
 *    DM on the account; today you find that out in the dialog *after* you have
 *    typed a new one and pressed Update. Here it appears beside the field the
 *    moment the value differs.
 *
 * Nothing new is invented: it is the same fields, the same HighLevel channels,
 * the same licence options, wearing `.profile-card`, `.identity-pill`, and
 * `.card-flag` — the primitives the feed and the profile already use. */
export function SettingsMock({ surfaces }: { surfaces: MockSurface[] }) {
  /* Which surface the member arrived from. Unlike /mock/feed, this is genuinely
     stateful rather than pinned: the point of the page is that it is the same
     page under either masthead, and the only way to show that is to let a
     reviewer swap the chrome and watch the body stay put. */
  const [surfaceId, setSurfaceId] = useState('www');
  const current =
    surfaces.find((surface) => surface.id === surfaceId) ?? surfaces[0];

  /* Fields the save bar is responsible for. */
  const [name, setName] = useState(MOCK_ACCOUNT.name);
  const [screenname, setScreenname] = useState(MOCK_ACCOUNT.screenname);
  const [zip, setZip] = useState(MOCK_ACCOUNT.zipCode);

  /* The avatar writes on save rather than through the save bar, because it is
     the one field here that is a file rather than a value. Nullable so the
     toolbar can show the empty bubble, which is the state worth reviewing:
     a member with no picture is exactly who this affordance is for. */
  const [avatar, setAvatar] = useState<string | null>(MOCK_ACCOUNT.avatar);

  /* Fields that write on change, as they already do in the live page. */
  const [license, setLicense] =
    useState<LicenseOption['value']>(DEFAULT_LICENSE);
  const [licenseSave, setLicenseSave] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const [channels, setChannels] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MARKETING_CHANNELS.map((channel) => [channel.key, channel.enabled])
    )
  );
  const [channelSave, setChannelSave] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );

  const dirty =
    name !== MOCK_ACCOUNT.name ||
    screenname !== MOCK_ACCOUNT.screenname ||
    zip !== MOCK_ACCOUNT.zipCode;

  function revert() {
    setName(MOCK_ACCOUNT.name);
    setScreenname(MOCK_ACCOUNT.screenname);
    setZip(MOCK_ACCOUNT.zipCode);
  }

  return (
    <main className="surface-cream min-h-screen pb-20">
      <MockToolbar
        surfaces={surfaces}
        currentId={current.id}
        onSelectSurface={setSurfaceId}
        hostname={current.hostname}
        hasPicture={avatar !== null}
        onPicture={(has) => setAvatar(has ? MOCK_ACCOUNT.avatar : null)}
      />

      {/* The same masthead component every other surface mock wears. Swapping
          it is the argument: the chrome changes, the account does not. */}
      <SurfaceMasthead
        surfaces={surfaces}
        current={current}
        onSelect={setSurfaceId}
        sticky
        contained
      />

      <div className="container mx-auto max-w-5xl px-4 pt-8">
        <PageHead
          surfaceName={current.name}
          name={name}
          avatar={avatar}
          onAvatar={setAvatar}
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
          <SettingsNav />

          <div className="min-w-0 space-y-12">
            <IdentitySection
              name={name}
              onName={setName}
              screenname={screenname}
              onScreenname={setScreenname}
            />
            <SigninSection />
            <PlaceSection zip={zip} onZip={setZip} />
            <PublishingSection
              license={license}
              onLicense={(value) => {
                setLicense(value);
                flash(setLicenseSave);
              }}
              saveState={licenseSave}
            />
            <MessagesSection
              channels={channels}
              onChannel={(key, value) => {
                setChannels((prev) => ({ ...prev, [key]: value }));
                flash(setChannelSave);
              }}
              onAllOff={() => {
                setChannels(
                  Object.fromEntries(
                    MARKETING_CHANNELS.map((channel) => [channel.key, false])
                  )
                );
                flash(setChannelSave);
              }}
              saveState={channelSave}
            />
            <DataSection />

            <section>
              <span className="section-eyebrow">Room to grow</span>
              <h2 className="mt-3 text-xl font-black tracking-tight">
                Designed in, not built yet
              </h2>
              <p className="settings-note mt-1.5 max-w-2xl">
                Each of these has a section shape waiting for it, so landing one
                is a new card in an existing column rather than another
                accordion row.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {RESERVED_SETTINGS.map((item) => (
                  <div key={item.title} className="reserved-slot">
                    <p className="reserved-slot-title">{item.title}</p>
                    <p className="settings-note">{item.blurb}</p>
                  </div>
                ))}
              </div>
            </section>

            {dirty && <SaveBar onRevert={revert} />}
          </div>
        </div>

        <p className="border-pana-ink/10 text-pana-ink/55 mt-14 border-t pt-6 text-[13px] font-bold">
          Design mock at <code>/mock/settings</code> with hardcoded data. It is
          the same page under either masthead — switch the surface in the
          toolbar and nothing below the header moves, which is the claim the
          switcher at{' '}
          <Link href="/mock/panaverse" className="link-arrow text-pana-indigo">
            /mock/panaverse
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>{' '}
          already makes in its footer. The live route is{' '}
          <code>/account/user/edit</code>.
        </p>
      </div>
    </main>
  );
}

/* Saving is instant in a mock, and an instant "Saved" that never appears is
   indistinguishable from a control that does nothing. The delay is there to
   make the state legible, not to simulate latency. */
function flash(set: (state: 'idle' | 'saving' | 'saved') => void) {
  set('saving');
  setTimeout(() => set('saved'), 450);
}

/* Who the settings belong to, stated once at the top.
 *
 * The live page opens with "Update Your Account Settings", which is an
 * instruction rather than a heading and does not say whose account. Leading
 * with the member and the handle answers the question most people arrive with
 * — "is this the right account, and what am I called here" — before they have
 * scrolled to a single field. */
function PageHead({
  surfaceName,
  name,
  avatar,
  onAvatar,
}: {
  surfaceName: string;
  name: string;
  avatar: string | null;
  onAvatar: (url: string) => void;
}) {
  return (
    <header>
      <span className="section-eyebrow">Account</span>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <AvatarEditor name={name} avatarUrl={avatar} onSave={onAvatar} />
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">{name}</h1>
          <p className="text-pana-ink/60 truncate text-[13px] font-extrabold">
            {MOCK_ACCOUNT.fediverseHandle}
          </p>
        </div>
      </div>
      <p className="settings-note mt-4 max-w-2xl">
        You opened this from{' '}
        <span className="text-pana-ink font-extrabold">{surfaceName}</span>, but
        there is only one of it. Everything here is the same account on every
        Pana Mia surface — the sections below say so individually, and mean it.
      </p>
    </header>
  );
}

/* The save bar.
 *
 * Present only when something is unsaved, which is the difference between it
 * and the live page's permanently enabled "Update" button at the bottom of the
 * form. A button that is always available cannot tell you whether you have
 * pending changes, and on a page this long that is the one thing you need it
 * to tell you. */
function SaveBar({ onRevert }: { onRevert: () => void }) {
  return (
    <div className="settings-savebar" role="status">
      <span className="text-pana-ink">You have unsaved changes.</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="settings-btn"
          data-variant="quiet"
          onClick={onRevert}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Discard
        </button>
        <button type="button" className="settings-btn">
          Save changes
        </button>
      </div>
    </div>
  );
}

/* Developer chrome, above the masthead and outside the design under review —
   the same bar /mock/feed uses, for the same reason. Its switch chooses which
   surface the page is being viewed from, because on this page that is the
   state worth being able to flip. */
function MockToolbar({
  surfaces,
  currentId,
  onSelectSurface,
  hostname,
  hasPicture,
  onPicture,
}: {
  surfaces: MockSurface[];
  currentId: string;
  onSelectSurface: (id: string) => void;
  hostname: string;
  hasPicture: boolean;
  onPicture: (has: boolean) => void;
}) {
  return (
    <div className="mock-toolbar">
      <span className="mock-toolbar-badge">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Mock
      </span>

      <span className="mock-toolbar-host">
        <Lock className="h-3 w-3 flex-none" aria-hidden="true" />
        {hostname}/account/user/edit
      </span>

      <div className="mock-switch ml-auto">
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            data-active={surface.id === currentId}
            onClick={() => onSelectSurface(surface.id)}
          >
            From {surface.name}
          </button>
        ))}
      </div>

      {/* The empty bubble is the state worth being able to look at: a member
          who already has a picture is not the one this affordance is for. */}
      <div className="mock-switch">
        <button
          type="button"
          data-active={hasPicture}
          onClick={() => onPicture(true)}
        >
          With picture
        </button>
        <button
          type="button"
          data-active={!hasPicture}
          onClick={() => onPicture(false)}
        >
          No picture
        </button>
      </div>

      <Link href="/mock/panaverse" className="mock-toolbar-link">
        Panaverse chrome
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
