'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Eye,
  LoaderCircle,
  MessageSquareText,
  Send,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

type AudienceId = 'active-connectors' | 'connector-applicants' | 'group-hosts';
type ComposerStep = 'audience' | 'message' | 'review';

interface Audience {
  id: AudienceId;
  name: string;
  description: string;
  total: number;
  eligible?: number;
  excluded?: number;
  exclusions?: Array<{ reason: string; count: number }>;
}

interface Campaign {
  id?: string;
  name: string;
  audience: string;
  createdAt: string;
  scheduledAt: string | null;
  status: string;
  candidateCount: number;
  eligibleCount: number;
  excludedCount: number;
  sentCount: number;
  failedCount: number;
}

interface CommunityNotificationsProps {
  mode?: 'mock' | 'live';
  initialAudiences?: Audience[];
  initialCampaigns?: Campaign[];
  highLevelConfigured?: boolean;
}

const MOCK_AUDIENCES: Audience[] = [
  {
    id: 'active-connectors',
    name: 'Active Pana Connectors',
    description: 'Everyone currently serving in a connector house.',
    total: 42,
    eligible: 38,
    excluded: 4,
  },
  {
    id: 'connector-applicants',
    name: 'Connector applicants',
    description: 'People whose connector application is still under review.',
    total: 18,
    eligible: 16,
    excluded: 2,
  },
  {
    id: 'group-hosts',
    name: 'Community group hosts',
    description: 'Panas who administer or moderate an active group.',
    total: 27,
    eligible: 24,
    excluded: 3,
  },
];

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    name: 'Connector orientation reminder',
    audience: 'Active Pana Connectors',
    createdAt: '2026-10-18T14:00:00.000Z',
    scheduledAt: null,
    status: 'completed',
    candidateCount: 38,
    eligibleCount: 38,
    excludedCount: 0,
    sentCount: 36,
    failedCount: 2,
  },
  {
    name: 'Hosts monthly check-in',
    audience: 'Community group hosts',
    createdAt: '2026-10-04T14:00:00.000Z',
    scheduledAt: null,
    status: 'completed',
    candidateCount: 24,
    eligibleCount: 24,
    excludedCount: 0,
    sentCount: 23,
    failedCount: 1,
  },
];

const DEFAULT_MESSAGE =
  'Pana MIA: Your community connector circle is ready. Meet your fellow panas and choose how you want to help: pana.social/connectors/hq\n\nReply STOP to opt out.';

const STEPS: readonly { id: ComposerStep; label: string }[] = [
  { id: 'audience', label: 'Audience' },
  { id: 'message', label: 'Message' },
  { id: 'review', label: 'Review' },
];

function StepRail({
  current,
  onChange,
}: {
  current: ComposerStep;
  onChange: (step: ComposerStep) => void;
}) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Campaign steps">
      {STEPS.map((step, index) => {
        const active = step.id === current;
        const complete = index < currentIndex;
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onChange(step.id)}
              className={[
                'flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                active
                  ? 'border-pana-navy bg-pana-blue font-black'
                  : complete
                    ? 'border-pana-ink/10 bg-white font-bold'
                    : 'border-pana-ink/10 bg-pana-cream text-pana-ink/55 font-bold',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black',
                  active
                    ? 'bg-pana-ink text-white'
                    : complete
                      ? 'bg-pana-indigo text-white'
                      : 'bg-pana-ink/10 text-pana-ink/55',
                ].join(' ')}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function AudienceStep({
  audiences,
  selected,
  loading,
  onSelect,
}: {
  audiences: Audience[];
  selected: AudienceId;
  loading: boolean;
  onSelect: (value: AudienceId) => void;
}) {
  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <span className="bg-pana-indigo flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
          <UsersRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-black">Who should receive this?</h2>
          <p className="text-pana-ink/60 mt-1 text-sm leading-relaxed">
            These groups come from Panamia, so the audience stays current
            without rebuilding a list in HighLevel.
          </p>
        </div>
      </div>

      <RadioGroup
        value={selected}
        onValueChange={(value) => onSelect(value as AudienceId)}
        className="gap-3"
      >
        {audiences.map((audience) => (
          <label
            key={audience.id}
            htmlFor={audience.id}
            className={[
              'flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors',
              selected === audience.id
                ? 'border-pana-navy bg-[#e0f4fd]'
                : 'border-pana-ink/10 hover:border-pana-ink/25 bg-white',
            ].join(' ')}
          >
            <RadioGroupItem
              id={audience.id}
              value={audience.id}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black">{audience.name}</span>
                <span className="text-pana-ink/55 text-xs font-bold">
                  {audience.total} people
                </span>
              </span>
              <span className="text-pana-ink/60 mt-1 block text-sm">
                {audience.description}
              </span>
              {selected === audience.id ? (
                <>
                  <span className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    {loading || audience.eligible === undefined ? (
                      <span className="bg-pana-cream text-pana-ink/60 flex items-center gap-1.5 rounded-full px-2.5 py-1">
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                        Checking HighLevel eligibility
                      </span>
                    ) : (
                      <>
                        <span className="rounded-full bg-[#e5f3e8] px-2.5 py-1 text-[#185c31]">
                          {audience.eligible} SMS eligible
                        </span>
                        <span className="bg-pana-cream text-pana-ink/60 rounded-full px-2.5 py-1">
                          {audience.excluded} excluded
                        </span>
                      </>
                    )}
                  </span>
                  {!loading && audience.exclusions?.length ? (
                    <span className="text-pana-ink/60 mt-2 block text-xs leading-relaxed">
                      {audience.exclusions
                        .map(
                          (exclusion) =>
                            `${exclusion.count} ${exclusion.reason.toLowerCase()}`
                        )
                        .join(' · ')}
                    </span>
                  ) : null}
                </>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup>

      <div className="border-pana-ink/10 bg-pana-butter-2 mt-5 flex gap-3 rounded-xl border p-4">
        <ShieldCheck className="text-pana-navy mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-black">
            Consent check happens automatically
          </p>
          <p className="text-pana-ink/60 mt-1 text-xs leading-relaxed">
            Anyone without a phone or HighLevel contact, with SMS DND enabled,
            or who has opted out is removed before the campaign is submitted.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageStep({
  campaignName,
  message,
  scheduled,
  scheduleAt,
  onCampaignNameChange,
  onMessageChange,
  onScheduledChange,
  onScheduleAtChange,
}: {
  campaignName: string;
  message: string;
  scheduled: boolean;
  scheduleAt: string;
  onCampaignNameChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onScheduledChange: (value: boolean) => void;
  onScheduleAtChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <span className="bg-pana-flame text-pana-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-black">Write the notification</h2>
          <p className="text-pana-ink/60 mt-1 text-sm leading-relaxed">
            Every message identifies Pana MIA and keeps Reply STOP instructions.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-xs font-black tracking-[0.1em] uppercase">
            Internal campaign name
          </span>
          <Input
            maxLength={120}
            value={campaignName}
            onChange={(event) => onCampaignNameChange(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-2 flex items-center justify-between gap-3 text-xs font-black tracking-[0.1em] uppercase">
            Text message
            <span className="text-pana-ink/45 tracking-normal normal-case">
              {message.length} / 1,200 characters
            </span>
          </span>
          <Textarea
            maxLength={1200}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            className="min-h-44 resize-y leading-relaxed"
          />
        </label>
        <div>
          <p className="mb-2 text-xs font-black tracking-[0.1em] uppercase">
            Delivery
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onScheduledChange(false)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left ${
                !scheduled
                  ? 'border-pana-navy bg-[#e0f4fd]'
                  : 'border-pana-ink/10 bg-white'
              }`}
            >
              <Send className="h-5 w-5" />
              <span>
                <span className="block text-sm font-black">Send now</span>
                <span className="text-pana-ink/55 block text-xs">
                  Submit after confirmation
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onScheduledChange(true)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left ${
                scheduled
                  ? 'border-pana-navy bg-[#e0f4fd]'
                  : 'border-pana-ink/10 bg-white'
              }`}
            >
              <CalendarClock className="h-5 w-5" />
              <span>
                <span className="block text-sm font-black">Schedule</span>
                <span className="text-pana-ink/55 block text-xs">
                  HighLevel holds delivery
                </span>
              </span>
            </button>
          </div>
          {scheduled ? (
            <Input
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => onScheduleAtChange(event.target.value)}
              className="mt-3 max-w-sm"
              aria-label="Scheduled delivery time"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  audience,
  campaignName,
  message,
  scheduled,
  scheduleAt,
  result,
  sending,
  error,
  mode,
  onSend,
}: {
  audience: Audience;
  campaignName: string;
  message: string;
  scheduled: boolean;
  scheduleAt: string;
  result: Campaign | null;
  sending: boolean;
  error: string | null;
  mode: 'mock' | 'live';
  onSend: () => void;
}) {
  if (result) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e5f3e8] text-[#185c31]">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h2 className="mt-5 text-2xl font-black">
          {mode === 'mock' ? 'Mock campaign queued' : 'Campaign submitted'}
        </h2>
        <p className="text-pana-ink/60 mt-2 max-w-md text-sm leading-relaxed">
          {mode === 'mock'
            ? 'No messages were sent from this review-only mock.'
            : `${result.sentCount} messages were accepted by HighLevel, ${result.excludedCount} people were excluded, and ${result.failedCount} submissions failed.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <span className="bg-pana-butter text-pana-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Eye className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-black">Review before sending</h2>
          <p className="text-pana-ink/60 mt-1 text-sm leading-relaxed">
            One final check of the people, timing and exact message.
          </p>
        </div>
      </div>

      <dl className="divide-pana-ink/10 border-pana-ink/10 divide-y overflow-hidden rounded-2xl border bg-white">
        {[
          ['Campaign', campaignName || 'Untitled campaign'],
          ['Audience', audience.name],
          [
            'Recipients',
            audience.eligible === undefined
              ? 'Eligibility has not finished'
              : `${audience.eligible} eligible; ${audience.excluded ?? 0} excluded`,
          ],
          [
            'Delivery',
            scheduled
              ? scheduleAt
                ? new Date(scheduleAt).toLocaleString()
                : 'Schedule time not selected'
              : 'Immediately after confirmation',
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 px-4 py-4 sm:grid-cols-[10rem_1fr]"
          >
            <dt className="text-pana-ink/50 text-xs font-black tracking-[0.1em] uppercase">
              {label}
            </dt>
            <dd className="text-sm font-bold">{value}</dd>
          </div>
        ))}
        <div className="grid gap-2 px-4 py-4 sm:grid-cols-[10rem_1fr]">
          <dt className="text-pana-ink/50 text-xs font-black tracking-[0.1em] uppercase">
            Message
          </dt>
          <dd className="text-sm leading-relaxed whitespace-pre-wrap">
            {message}
          </dd>
        </div>
      </dl>

      <div className="border-pana-ink/10 bg-pana-butter-2 mt-5 flex gap-3 rounded-xl border p-4">
        <CircleAlert className="text-pana-navy mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-pana-ink/65 text-xs leading-relaxed">
          Confirm carefully. Messages already accepted by HighLevel cannot be
          recalled from this screen.
        </p>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl bg-[#ffdfcf] p-3 text-sm font-bold">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={sending || audience.eligible === undefined}
        onClick={onSend}
        className="bg-pana-ink hover:bg-pana-navy mt-5 h-12 w-full rounded-xl text-white"
      >
        {sending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {sending
          ? 'Submitting to HighLevel…'
          : `${scheduled ? 'Schedule' : 'Send'} to ${audience.eligible ?? 0} people`}
      </Button>
    </div>
  );
}

function PhonePreview({
  audience,
  message,
}: {
  audience: Audience;
  message: string;
}) {
  return (
    <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
      <div className="border-pana-ink/10 rounded-2xl border bg-white p-5 shadow-[0_8px_24px_rgb(17_13_13_/_0.06)]">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-black tracking-[0.12em] uppercase">
            Phone preview
          </p>
          <Smartphone className="text-pana-ink/45 h-4 w-4" />
        </div>
        <div className="border-pana-ink mx-auto max-w-xs rounded-[2rem] border-[6px] bg-[#f2f1ed] p-3 shadow-inner">
          <div className="bg-pana-ink/20 mx-auto mb-5 h-1.5 w-16 rounded-full" />
          <p className="text-center text-xs font-black">Pana MIA</p>
          <p className="text-pana-ink/45 mt-0.5 text-center text-[0.65rem]">
            Text message
          </p>
          <div className="mt-6 min-h-64">
            <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
              {message || 'Your message preview will appear here.'}
            </div>
          </div>
        </div>
      </div>

      <div className="border-pana-ink/10 rounded-2xl border bg-white p-5 shadow-[0_8px_24px_rgb(17_13_13_/_0.06)]">
        <p className="text-xs font-black tracking-[0.12em] uppercase">
          Current audience
        </p>
        <p className="mt-3 text-lg font-black">{audience.name}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['Selected', audience.total, 'bg-pana-cream'],
            ['Eligible', audience.eligible ?? '—', 'bg-[#e5f3e8]'],
            ['Excluded', audience.excluded ?? '—', 'bg-[#ffdfcf]'],
          ].map(([label, value, fill]) => (
            <div key={label} className={`rounded-xl p-3 ${fill}`}>
              <p className="text-xl font-black">{value}</p>
              <p className="text-pana-ink/55 text-[0.65rem] font-bold uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CampaignHistory({
  campaigns,
  connected,
  mode,
}: {
  campaigns: Campaign[];
  connected: boolean;
  mode: 'mock' | 'live';
}) {
  return (
    <section className="border-pana-ink/10 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgb(17_13_13_/_0.06)]">
      <header className="border-pana-ink/10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-black tracking-[0.08em] uppercase">
            Recent campaigns
          </h2>
          <p className="text-pana-ink/50 mt-1 text-xs">
            {mode === 'mock'
              ? 'Fixture history for the review-only mock.'
              : 'Accepted means HighLevel received the message request.'}
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${
            connected
              ? 'bg-[#e5f3e8] text-[#185c31]'
              : 'text-pana-ink bg-[#ffdfcf]'
          }`}
        >
          {connected ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <CircleAlert className="h-3.5 w-3.5" />
          )}
          HighLevel {connected ? 'configured' : 'not configured'}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-pana-blue text-xs tracking-[0.08em] uppercase">
            <tr>
              <th className="px-5 py-3 font-black">Campaign</th>
              <th className="px-5 py-3 font-black">Audience</th>
              <th className="px-5 py-3 font-black">Created</th>
              <th className="px-5 py-3 font-black">Accepted</th>
              <th className="px-5 py-3 font-black">Excluded</th>
              <th className="px-5 py-3 font-black">Status</th>
            </tr>
          </thead>
          <tbody className="divide-pana-ink/10 divide-y">
            {campaigns.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-pana-ink/55 px-5 py-10 text-center"
                >
                  No campaigns have been sent yet.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr
                  key={campaign.id ?? `${campaign.name}-${campaign.createdAt}`}
                >
                  <td className="px-5 py-4 font-black">{campaign.name}</td>
                  <td className="text-pana-ink/65 px-5 py-4">
                    {campaign.audience}
                  </td>
                  <td className="text-pana-ink/65 px-5 py-4">
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold">
                    {campaign.sentCount} of {campaign.eligibleCount}
                  </td>
                  <td className="px-5 py-4 font-bold">
                    {campaign.excludedCount}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-black ${
                        campaign.status === 'completed'
                          ? 'bg-[#e5f3e8] text-[#185c31]'
                          : campaign.status === 'failed'
                            ? 'bg-[#ffdfcf]'
                            : 'bg-pana-butter-2'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CommunityNotifications({
  mode = 'mock',
  initialAudiences = MOCK_AUDIENCES,
  initialCampaigns = MOCK_CAMPAIGNS,
  highLevelConfigured = true,
}: CommunityNotificationsProps = {}) {
  const [step, setStep] = useState<ComposerStep>('audience');
  const [audiences, setAudiences] = useState(initialAudiences);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [audienceId, setAudienceId] = useState<AudienceId>('active-connectors');
  const [campaignName, setCampaignName] = useState('Connector circle launch');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Campaign | null>(null);
  const [campaignRequestId, setCampaignRequestId] = useState('');

  const audience = useMemo(
    () => audiences.find((item) => item.id === audienceId) ?? audiences[0],
    [audienceId, audiences]
  );
  const stepIndex = STEPS.findIndex((item) => item.id === step);

  useEffect(() => {
    if (mode !== 'live') return;
    const controller = new AbortController();
    setPreviewing(true);
    setError(null);

    void fetch('/api/admin/community-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', audienceId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: Audience;
          error?: string;
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error ?? 'Could not check this audience.');
        }
        setAudiences((current) =>
          current.map((item) => (item.id === audienceId ? body.data! : item))
        );
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setError(
          cause instanceof Error ? cause.message : 'Could not check audience.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewing(false);
      });

    return () => controller.abort();
  }, [audienceId, mode]);

  function move(direction: -1 | 1) {
    const next = STEPS[stepIndex + direction];
    if (next) setStep(next.id);
  }

  async function submitCampaign() {
    setError(null);
    if (mode === 'mock') {
      setResult({
        name: campaignName,
        audience: audience.name,
        createdAt: new Date().toISOString(),
        scheduledAt: null,
        status: 'completed',
        candidateCount: audience.total,
        eligibleCount: audience.eligible ?? 0,
        excludedCount: audience.excluded ?? 0,
        sentCount: audience.eligible ?? 0,
        failedCount: 0,
      });
      return;
    }

    setSending(true);
    try {
      const requestId = campaignRequestId || crypto.randomUUID();
      if (!campaignRequestId) setCampaignRequestId(requestId);
      const response = await fetch('/api/admin/community-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          requestId,
          audienceId,
          name: campaignName,
          message,
          scheduledAt:
            scheduled && scheduleAt ? new Date(scheduleAt).toISOString() : null,
        }),
      });
      const body = (await response.json()) as {
        data?: Campaign;
        error?: string;
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error ?? 'Could not submit this campaign.');
      }
      setResult(body.data);
      setCampaigns((current) => [body.data!, ...current]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not submit campaign.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="border-pana-ink/10 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgb(17_13_13_/_0.06)]">
        <div className="border-pana-ink/10 bg-pana-cream border-b p-4 sm:p-5">
          <StepRail current={step} onChange={setStep} />
        </div>
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:p-7">
          <div>
            {step === 'audience' ? (
              <AudienceStep
                audiences={audiences}
                selected={audienceId}
                loading={previewing}
                onSelect={setAudienceId}
              />
            ) : null}
            {step === 'message' ? (
              <MessageStep
                campaignName={campaignName}
                message={message}
                scheduled={scheduled}
                scheduleAt={scheduleAt}
                onCampaignNameChange={setCampaignName}
                onMessageChange={setMessage}
                onScheduledChange={setScheduled}
                onScheduleAtChange={setScheduleAt}
              />
            ) : null}
            {step === 'review' ? (
              <ReviewStep
                audience={audience}
                campaignName={campaignName}
                message={message}
                scheduled={scheduled}
                scheduleAt={scheduleAt}
                result={result}
                sending={sending}
                error={error}
                mode={mode}
                onSend={submitCampaign}
              />
            ) : null}
            {step !== 'review' && error ? (
              <p className="mt-5 rounded-xl bg-[#ffdfcf] p-3 text-sm font-bold">
                {error}
              </p>
            ) : null}

            {!result ? (
              <div className="border-pana-ink/10 mt-7 flex items-center justify-between border-t pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => move(-1)}
                  disabled={stepIndex === 0}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                {stepIndex < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => move(1)}
                    disabled={
                      step === 'audience' &&
                      (previewing || audience.eligible === undefined)
                    }
                    className="bg-pana-ink hover:bg-pana-navy text-white"
                  >
                    {step === 'audience'
                      ? `Write message for ${audience.eligible ?? 0}`
                      : 'Review campaign'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <PhonePreview audience={audience} message={message} />
        </div>
      </section>

      <CampaignHistory
        campaigns={campaigns}
        connected={highLevelConfigured}
        mode={mode}
      />
    </div>
  );
}
