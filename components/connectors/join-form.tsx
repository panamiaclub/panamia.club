'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import {
  HouseFocusFields,
  type HouseFocusDraft,
} from '@/components/connectors/house-focus-fields';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import {
  HOUSE_FOCUS_ERROR,
  HOUSES,
  PODS,
  TIERS,
  getHouse,
  getTier,
  parseHouseFocus,
} from '@/lib/connectors/model';
import type { HouseId, PodId, TierId } from '@/lib/connectors/model';
import { CONNECTORS_CHROME } from '@/lib/connectors/theme';

/**
 * The connector intake.
 *
 * ## Why this exists at all
 *
 * The front page's primary button said "Become a Connector" and pointed at
 * `/form/get-listed`, which is the public *business directory* intake — a
 * seven-step form asking for your shop's categories and socials. Someone who
 * read the whole programme pitch and decided they wanted in was handed a form
 * about their business, or about a business they do not have. That was the one
 * genuine hole in the surface: the pitch had no door at the end of it.
 *
 * ## Why these three questions
 *
 * Join a pod, choose a major and a different minor house, and say what you
 * can bring. Every field a reviewer might reach for — how long have you
 * been organizing, what are your qualifications, how many hours a week — is
 * absent on purpose, because the programme is emphatic that the tiers do not
 * rank anybody and that everyone starts at Tier 1. A form that opens by
 * scoring people contradicts the programme on the way in.
 *
 * That is still true with an approval step in front of it. Staff decide
 * whether somebody joins; this form does not try to help them by collecting
 * evidence, because the decision is a conversation about a person and not a
 * score computed from a textarea.
 *
 * Tier is shown and not asked, for the same reason. New applicants start at
 * Tier 1; returning members see their granted tier. The API never reads a
 * tier off the request.
 *
 * Name and email are not asked either, because you have to be signed in to
 * reach this page and we already have both. Asking a signed-in member to type
 * their own name is how a form tells somebody it is not really connected to
 * anything.
 *
 * ## Submitting
 *
 * POSTs to `/api/connectors/join`, which writes a `pending` record on the
 * signed-in human's own profile and is idempotent — re-submitting edits the
 * application and carries over `appliedAt`, the staff decision and existing
 * commitments. That is what makes it safe to use this same form for "change
 * my houses" after being accepted.
 */

export function ConnectorJoinForm({
  initialPod = null,
  initialHouses = [],
  initialMajorHouse = null,
  initialMinorHouse = null,
  initialBring = '',
  initialSmsOptIn = false,
  initialSmsPhone = '',
  currentTier = 1,
  isEditing = false,
  isPending = false,
}: {
  initialPod?: PodId | null;
  initialHouses?: HouseId[];
  initialMajorHouse?: HouseId | null;
  initialMinorHouse?: HouseId | null;
  initialBring?: string;
  initialSmsOptIn?: boolean;
  initialSmsPhone?: string;
  currentTier?: TierId;
  isEditing?: boolean;
  /** Editing an application that has not been decided on yet. */
  isPending?: boolean;
}) {
  const router = useRouter();
  const [pod, setPod] = useState<PodId | null>(initialPod);
  const [houseFocus, setHouseFocus] = useState<HouseFocusDraft>({
    majorHouse: initialMajorHouse,
    minorHouse: initialMinorHouse,
  });
  const [bring, setBring] = useState(initialBring);
  const [smsOptIn, setSmsOptIn] = useState(initialSmsOptIn);
  const [smsPhone, setSmsPhone] = useState(initialSmsPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayTier = getTier(isEditing ? currentTier : 1);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!pod) {
      setError('Pick the pod you can actually get to.');
      return;
    }
    const focus = parseHouseFocus(houseFocus);
    if (!focus) {
      setError(HOUSE_FOCUS_ERROR);
      return;
    }
    if (smsOptIn && !smsPhone.trim()) {
      setError('Add the mobile number where you want Connector texts.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/connectors/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pod,
          ...focus,
          bring,
          smsOptIn,
          smsPhone,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        smsError?: string | null;
      };

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Could not save that. Try again.');
        setSaving(false);
        return;
      }
      if (data.smsError) {
        setError(
          `Your Connector application was saved, but text-message setup failed: ${data.smsError}`
        );
        setSaving(false);
        router.refresh();
        return;
      }

      // Refresh as well as navigate: HQ reads membership on the server, so the
      // cached RSC payload for it predates this write.
      router.replace('/connectors/hq');
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setSaving(false);
    }
  }

  return (
    <main className="bg-pana-cream text-pana-ink pb-20">
      <header
        className={`border-pana-ink border-b-2 ${CONNECTORS_CHROME.FILL}`}
      >
        <div className="container mx-auto px-4 py-12">
          <p
            className={`text-xs font-extrabold tracking-[0.2em] uppercase ${CONNECTORS_CHROME.ACCENT}`}
          >
            Pana Connectors
          </p>
          <h1
            className={`mt-2 max-w-3xl text-4xl leading-tight font-extrabold ${CONNECTORS_CHROME.ON_FILL} sm:text-5xl`}
          >
            {isEditing
              ? 'Change what you picked.'
              : 'Organize where you already are.'}
          </h1>
          <p className="text-pana-cream/70 mt-4 max-w-2xl text-base leading-relaxed">
            {isPending
              ? 'Your application has not been decided on yet, so you can still change any of this.'
              : isEditing
                ? 'Update your pod, major and minor houses, or what you can bring. Your membership and existing commitments stay as they are.'
                : 'Three questions. Which county you are in, what you already like doing, and what you can bring. Nothing here is a test — read '}
            {!isEditing && !isPending && (
              <>
                <SurfaceLink
                  href="/connectors"
                  className={`font-bold underline underline-offset-4 ${CONNECTORS_CHROME.ACCENT}`}
                >
                  what the programme is
                </SurfaceLink>{' '}
                first if you have not yet.
              </>
            )}
          </p>
        </div>
      </header>

      <div className="container mx-auto max-w-3xl px-4 py-10">
        <form className="flex flex-col gap-8" onSubmit={handleSubmit}>
          <Step
            number={1}
            title="Join your pod"
            lede="Pods are geographic, and they meet. Pick the county you can actually get to on a weeknight."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {PODS.map((p) => (
                <label
                  key={p.id}
                  className={`border-pana-ink flex cursor-pointer items-start gap-2.5 rounded-xl border-2 px-4 py-3 ${
                    pod === p.id ? 'bg-pana-butter-2' : 'bg-pana-cream'
                  }`}
                >
                  <input
                    type="radio"
                    name="pod"
                    value={p.id}
                    checked={pod === p.id}
                    onChange={() => setPod(p.id)}
                    className="border-pana-ink mt-0.5 size-4 shrink-0 border-2"
                  />
                  <span>
                    <span className="block text-base leading-tight font-extrabold">
                      {p.name}
                    </span>
                    <span className="text-pana-ink/60 mt-0.5 block text-sm">
                      {p.region}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Step>

          <Step
            number={2}
            title="Choose your major and minor houses"
            lede="Your major house is your primary focus; your minor house is your secondary focus. Both are required and must be different. You can help across houses, and these choices do not commit you to any work."
          >
            {isEditing &&
              initialHouses.length > 0 &&
              !parseHouseFocus({
                majorHouse: initialMajorHouse,
                minorHouse: initialMinorHouse,
              }) && (
                <p className="border-pana-ink/20 text-pana-ink/70 mb-4 rounded-lg border-2 border-dashed p-3 text-sm">
                  Previously selected:{' '}
                  {initialHouses.map((id) => getHouse(id).name).join(', ')}.
                  Those interests were not ranked. Confirm your major and minor
                  below.
                </p>
              )}
            <HouseFocusFields
              value={houseFocus}
              onChange={setHouseFocus}
              disabled={saving}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {HOUSES.map((house) => (
                <div
                  key={house.id}
                  className="border-pana-ink bg-pana-cream flex flex-col overflow-hidden rounded-xl border-2"
                >
                  <h3
                    className="px-4 py-3 text-base leading-tight font-extrabold"
                    style={{
                      backgroundColor: `var(--color-${house.color})`,
                      color: `var(--color-${house.onColor})`,
                    }}
                  >
                    {house.name}
                  </h3>
                  <span className="text-pana-ink/80 px-4 py-3 text-sm leading-snug">
                    {house.calling}
                  </span>
                </div>
              ))}
            </div>
          </Step>

          <Step
            number={3}
            title="Tell your pod what you can bring"
            lede="Not a résumé. The pod lead reads this to work out who to introduce you to first."
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-extrabold tracking-wide uppercase">
                What you can bring
              </span>
              <textarea
                name="bring"
                rows={3}
                value={bring}
                onChange={(e) => setBring(e.target.value)}
                maxLength={2000}
                placeholder="A van most weekends. I speak Creole. I can edit video. I know every venue in Little Haiti."
                className="border-pana-ink bg-pana-cream text-pana-ink placeholder:text-pana-ink/40 rounded-lg border-2 px-3 py-2 text-sm"
              />
              <span className="text-pana-ink/50 text-xs">
                Optional. You can change it whenever.
              </span>
            </label>
          </Step>

          <Step
            number={4}
            title="Choose whether we can text you"
            lede="Optional. Connector updates can still reach you in the app or by email."
          >
            <div className="border-pana-ink bg-pana-cream rounded-xl border-2 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(event) => setSmsOptIn(event.target.checked)}
                  className="border-pana-ink mt-1 size-4 shrink-0 rounded border-2"
                />
                <span className="text-sm leading-relaxed">
                  I agree to receive community and Connector text messages from
                  Pana MIA. Message frequency varies. Message and data rates may
                  apply. Reply STOP to opt out or HELP for help.
                </span>
              </label>
              {smsOptIn ? (
                <label className="mt-4 block">
                  <span className="text-xs font-extrabold tracking-wide uppercase">
                    Mobile number
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={smsPhone}
                    onChange={(event) => setSmsPhone(event.target.value)}
                    placeholder="(305) 555-0123"
                    className="border-pana-ink text-pana-ink mt-1.5 w-full max-w-sm rounded-lg border-2 bg-white px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              <p className="text-pana-ink/55 mt-3 text-xs leading-relaxed">
                See our{' '}
                <SurfaceLink
                  href="/legal/privacy"
                  className="font-bold underline underline-offset-2"
                >
                  privacy policy
                </SurfaceLink>{' '}
                and{' '}
                <SurfaceLink
                  href="/legal/terms"
                  className="font-bold underline underline-offset-2"
                >
                  terms
                </SurfaceLink>
                .
              </p>
            </div>
          </Step>

          <section className="border-pana-ink bg-pana-butter-2 rounded-xl border-2 p-5">
            <h2 className="text-base font-extrabold">
              {isEditing
                ? `Tier ${displayTier.id} — ${displayTier.name}`
                : `You would start at Tier ${displayTier.id} — ${displayTier.name}`}
            </h2>
            <p className="text-pana-ink/70 mt-2 text-sm leading-relaxed">
              {displayTier.blurb} Tiers are about how much you are carrying, not
              how good you are at it.{' '}
              {isEditing
                ? 'Changing these answers does not change your tier.'
                : 'Nothing on this form changes where you start.'}
            </p>
            <ol className="mt-4 flex flex-col gap-2 text-sm leading-snug">
              {TIERS.map((tier) => (
                <li key={tier.id} className="flex gap-2.5">
                  <span
                    className={`h-fit shrink-0 rounded-full border-2 px-2 py-0.5 text-xs font-extrabold ${
                      tier.id === displayTier.id
                        ? `${CONNECTORS_CHROME.BORDER} ${CONNECTORS_CHROME.FILL} ${CONNECTORS_CHROME.ON_FILL}`
                        : 'border-pana-ink/30 text-pana-ink/50'
                    }`}
                  >
                    Tier {tier.id}
                  </span>
                  <span
                    className={
                      tier.id === displayTier.id
                        ? 'font-bold'
                        : 'text-pana-ink/60'
                    }
                  >
                    {tier.name}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {error && (
            <p
              role="alert"
              className="border-pana-ink bg-pana-butter text-pana-ink rounded-lg border-2 px-4 py-3 text-sm font-bold"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className={`rounded-full border-2 ${CONNECTORS_CHROME.BORDER} ${CONNECTORS_CHROME.FILL} px-5 py-2.5 text-sm font-extrabold ${CONNECTORS_CHROME.ON_FILL} disabled:opacity-60`}
            >
              {saving
                ? 'Saving…'
                : isEditing
                  ? 'Save changes'
                  : 'Send my application'}
            </button>
            <p className="text-pana-ink/60 max-w-xl text-sm">
              {isEditing && !isPending ? (
                <>
                  Your membership, tier and existing commitments stay the same.{' '}
                  <SurfaceLink
                    href="/connectors/hq"
                    className="font-bold underline underline-offset-4"
                  >
                    Find opportunities in Connector HQ
                  </SurfaceLink>
                  .
                </>
              ) : (
                <>
                  {isPending
                    ? 'Your application stays in review.'
                    : 'The programme team reviews your application.'}{' '}
                  Once accepted, choose your first opportunity in{' '}
                  <SurfaceLink
                    href="/connectors/hq"
                    className="font-bold underline underline-offset-4"
                  >
                    Connector HQ
                  </SurfaceLink>
                  . You can claim an open place immediately, without another
                  approval step.
                </>
              )}
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

/** One numbered question, with its own rule above it. */
function Step({
  number,
  title,
  lede,
  children,
}: {
  number: number;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <span
          className={`rounded-full border-2 ${CONNECTORS_CHROME.BORDER} ${CONNECTORS_CHROME.FILL} px-2.5 py-0.5 text-xs font-extrabold ${CONNECTORS_CHROME.ON_FILL}`}
        >
          {number}
        </span>
        <h2 className="text-xl leading-tight font-extrabold">{title}</h2>
      </div>
      <p className="text-pana-ink/70 mt-2 text-sm leading-relaxed">{lede}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
