import { createId } from '@paralleldrive/cuid2';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { GhlClient } from '@/lib/ghl';
import {
  communitySmsCampaigns,
  communitySmsRecipients,
  profiles,
  socialActors,
  socialGroupMembers,
} from '@/lib/schema';

export const COMMUNITY_AUDIENCE_IDS = [
  'active-connectors',
  'connector-applicants',
  'group-hosts',
] as const;

export type CommunityAudienceId = (typeof COMMUNITY_AUDIENCE_IDS)[number];

export interface CommunityAudienceDefinition {
  id: CommunityAudienceId;
  name: string;
  description: string;
}

export const COMMUNITY_AUDIENCES: readonly CommunityAudienceDefinition[] = [
  {
    id: 'active-connectors',
    name: 'Active Pana Connectors',
    description: 'Everyone currently serving in a connector house.',
  },
  {
    id: 'connector-applicants',
    name: 'Connector applicants',
    description: 'People whose connector application is still under review.',
  },
  {
    id: 'group-hosts',
    name: 'Community group hosts',
    description: 'Panas who administer or moderate an active group.',
  },
] as const;

export const CAMPAIGN_NAME_MAX = 120;
export const CAMPAIGN_MESSAGE_MAX = 1_200;
const SEND_CONCURRENCY = 4;

interface Candidate {
  profileId: string;
  email: string;
  ghlContactId: string | null;
  ghlOptedOut: boolean;
}

interface EligibilityResult {
  candidate: Candidate;
  eligible: boolean;
  reason: string | null;
  contactId: string | null;
  error: boolean;
}

export interface AudiencePreview {
  id: CommunityAudienceId;
  name: string;
  description: string;
  total: number;
  eligible: number;
  excluded: number;
  exclusions: Array<{ reason: string; count: number }>;
}

export interface CommunityCampaignHistoryItem {
  id: string;
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

export interface CampaignInput {
  requestId: string;
  name: string;
  audienceId: CommunityAudienceId;
  message: string;
  scheduledAt: Date | null;
}

export interface CampaignValidation {
  ok: boolean;
  error?: string;
  value?: CampaignInput;
}

function candidateColumns() {
  return {
    profileId: profiles.id,
    email: profiles.email,
    ghlContactId: profiles.ghlContactId,
    ghlOptedOut: profiles.ghlOptedOut,
  };
}

function toCandidate(row: {
  profileId: string;
  email: string;
  ghlContactId: string | null;
  ghlOptedOut: boolean;
}): Candidate {
  return {
    profileId: row.profileId,
    email: row.email,
    ghlContactId: row.ghlContactId,
    ghlOptedOut: row.ghlOptedOut,
  };
}

export function isCommunityAudienceId(
  value: unknown
): value is CommunityAudienceId {
  return (
    typeof value === 'string' &&
    (COMMUNITY_AUDIENCE_IDS as readonly string[]).includes(value)
  );
}

export function validateCampaignInput(
  input: Record<string, unknown>,
  now = new Date()
): CampaignValidation {
  const requestId =
    typeof input.requestId === 'string' ? input.requestId.trim() : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId
    )
  ) {
    return { ok: false, error: 'Campaign request ID is invalid.' };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > CAMPAIGN_NAME_MAX) {
    return {
      ok: false,
      error: `Campaign name must be between 1 and ${CAMPAIGN_NAME_MAX} characters.`,
    };
  }

  if (!isCommunityAudienceId(input.audienceId)) {
    return { ok: false, error: 'Choose a valid audience.' };
  }

  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message || message.length > CAMPAIGN_MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message must be between 1 and ${CAMPAIGN_MESSAGE_MAX} characters.`,
    };
  }
  if (!/^pana mia\s*:/i.test(message)) {
    return { ok: false, error: 'Message must begin with “Pana MIA:”.' };
  }
  if (!/reply\s+stop\b/i.test(message)) {
    return {
      ok: false,
      error: 'Message must include “Reply STOP” opt-out instructions.',
    };
  }

  let scheduledAt: Date | null = null;
  if (input.scheduledAt !== null && input.scheduledAt !== undefined) {
    if (typeof input.scheduledAt !== 'string') {
      return { ok: false, error: 'Scheduled time is invalid.' };
    }
    scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return { ok: false, error: 'Scheduled time is invalid.' };
    }
    if (scheduledAt.getTime() < now.getTime() + 5 * 60 * 1000) {
      return {
        ok: false,
        error:
          'Scheduled campaigns must be at least five minutes in the future.',
      };
    }
    if (scheduledAt.getTime() > now.getTime() + 365 * 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        error: 'Campaigns cannot be scheduled more than one year ahead.',
      };
    }
  }

  return {
    ok: true,
    value: {
      requestId,
      name,
      audienceId: input.audienceId,
      message,
      scheduledAt,
    },
  };
}

export async function listAudienceCandidates(
  audienceId: CommunityAudienceId
): Promise<Candidate[]> {
  if (audienceId === 'active-connectors') {
    const rows = await db
      .select(candidateColumns())
      .from(profiles)
      .where(
        and(
          isNotNull(profiles.connector),
          sql`${profiles.connector} ->> 'status' = 'active'`
        )
      );
    return rows.map(toCandidate);
  }

  if (audienceId === 'connector-applicants') {
    const rows = await db
      .select(candidateColumns())
      .from(profiles)
      .where(
        and(
          isNotNull(profiles.connector),
          sql`${profiles.connector} ->> 'status' = 'pending'`
        )
      );
    return rows.map(toCandidate);
  }

  const rows = await db
    .selectDistinct(candidateColumns())
    .from(socialGroupMembers)
    .innerJoin(socialActors, eq(socialActors.id, socialGroupMembers.actorId))
    .innerJoin(profiles, eq(profiles.id, socialActors.profileId))
    .where(
      and(
        eq(socialGroupMembers.status, 'active'),
        inArray(socialGroupMembers.role, ['admin', 'moderator']),
        isNotNull(socialActors.profileId)
      )
    );
  return rows.map(toCandidate);
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, values.length)) },
      () => worker()
    )
  );
  return results;
}

async function checkEligibility(
  candidates: readonly Candidate[],
  ghl: GhlClient
): Promise<EligibilityResult[]> {
  return mapConcurrent(candidates, SEND_CONCURRENCY, async (candidate) => {
    if (candidate.ghlOptedOut) {
      return {
        candidate,
        eligible: false,
        reason: 'Opted out of marketing',
        contactId: null,
        error: false,
      };
    }

    try {
      const contact = await ghl.resolveContact(
        candidate.ghlContactId,
        candidate.email
      );
      if (!contact) {
        return {
          candidate,
          eligible: false,
          reason: 'No HighLevel contact',
          contactId: null,
          error: false,
        };
      }

      if (contact.id !== candidate.ghlContactId) {
        await db
          .update(profiles)
          .set({ ghlContactId: contact.id })
          .where(eq(profiles.id, candidate.profileId));
      }

      if (!contact.phone?.trim()) {
        return {
          candidate,
          eligible: false,
          reason: 'No phone number',
          contactId: contact.id,
          error: false,
        };
      }

      if (
        contact.dnd === true ||
        contact.dndSettings?.SMS?.status === 'active'
      ) {
        return {
          candidate,
          eligible: false,
          reason: 'SMS do-not-disturb',
          contactId: contact.id,
          error: false,
        };
      }

      return {
        candidate,
        eligible: true,
        reason: null,
        contactId: contact.id,
        error: false,
      };
    } catch (error) {
      console.error(
        `[community-sms] eligibility failed for profile ${candidate.profileId}:`,
        error
      );
      return {
        candidate,
        eligible: false,
        reason: 'HighLevel contact check failed',
        contactId: null,
        error: true,
      };
    }
  });
}

function requireGhl() {
  const ghl = GhlClient.create();
  if (!ghl) {
    throw new Error(
      'HighLevel is not configured. GHL_API_KEY and GHL_LOCATION_ID are required.'
    );
  }
  return ghl;
}

function summarizeEligibility(
  audienceId: CommunityAudienceId,
  results: readonly EligibilityResult[]
): AudiencePreview {
  const definition = COMMUNITY_AUDIENCES.find(
    (audience) => audience.id === audienceId
  );
  if (!definition) throw new Error(`Unknown audience: ${audienceId}`);

  const counts = new Map<string, number>();
  for (const result of results) {
    if (!result.reason) continue;
    counts.set(result.reason, (counts.get(result.reason) ?? 0) + 1);
  }

  const eligible = results.filter((result) => result.eligible).length;
  return {
    ...definition,
    total: results.length,
    eligible,
    excluded: results.length - eligible,
    exclusions: [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}

export async function previewAudience(
  audienceId: CommunityAudienceId
): Promise<AudiencePreview> {
  const candidates = await listAudienceCandidates(audienceId);
  const results = await checkEligibility(candidates, requireGhl());
  const failures = results.filter((result) => result.error).length;
  if (failures > 0) {
    throw new Error(
      `HighLevel could not verify ${failures} ${failures === 1 ? 'contact' : 'contacts'}. Try the eligibility check again.`
    );
  }
  return summarizeEligibility(audienceId, results);
}

export async function listAudienceSummaries() {
  const counts = await Promise.all(
    COMMUNITY_AUDIENCES.map(async (audience) => ({
      ...audience,
      total: (await listAudienceCandidates(audience.id)).length,
    }))
  );
  return counts;
}

export async function listCampaignHistory(
  limit = 20
): Promise<CommunityCampaignHistoryItem[]> {
  const rows = await db.query.communitySmsCampaigns.findMany({
    orderBy: desc(communitySmsCampaigns.createdAt),
    limit,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    audience:
      COMMUNITY_AUDIENCES.find((item) => item.id === row.audience)?.name ??
      row.audience,
    createdAt: row.createdAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    status: row.status,
    candidateCount: row.candidateCount,
    eligibleCount: row.eligibleCount,
    excludedCount: row.excludedCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
  }));
}

export async function createAndSendCampaign(
  input: CampaignInput,
  adminUserId: string
): Promise<CommunityCampaignHistoryItem> {
  const ghl = requireGhl();
  const candidates = await listAudienceCandidates(input.audienceId);
  const campaignId = createId();

  const [inserted] = await db
    .insert(communitySmsCampaigns)
    .values({
      id: campaignId,
      requestId: input.requestId,
      createdBy: adminUserId,
      name: input.name,
      audience: input.audienceId,
      message: input.message,
      scheduledAt: input.scheduledAt,
      status: 'processing',
      candidateCount: candidates.length,
    })
    .onConflictDoNothing({ target: communitySmsCampaigns.requestId })
    .returning();

  if (!inserted) {
    const existing = await db.query.communitySmsCampaigns.findFirst({
      where: eq(communitySmsCampaigns.requestId, input.requestId),
    });
    if (!existing) {
      throw new Error('Campaign request conflicted but could not be reloaded.');
    }
    if (existing.status === 'processing') {
      throw new Error('Campaign request is already processing.');
    }
    return {
      id: existing.id,
      name: existing.name,
      audience:
        COMMUNITY_AUDIENCES.find((item) => item.id === existing.audience)
          ?.name ?? existing.audience,
      createdAt: existing.createdAt.toISOString(),
      scheduledAt: existing.scheduledAt?.toISOString() ?? null,
      status: existing.status,
      candidateCount: existing.candidateCount,
      eligibleCount: existing.eligibleCount,
      excludedCount: existing.excludedCount,
      sentCount: existing.sentCount,
      failedCount: existing.failedCount,
    };
  }

  const eligibility = await checkEligibility(candidates, ghl);
  const eligibilityFailures = eligibility.filter((result) => result.error);
  const excluded = eligibility.filter(
    (result) => !result.eligible && !result.error
  );
  const eligible = eligibility.filter(
    (result): result is EligibilityResult & { contactId: string } =>
      result.eligible && result.contactId !== null
  );

  if (excluded.length > 0) {
    await db.insert(communitySmsRecipients).values(
      excluded.map((result) => ({
        campaignId,
        profileId: result.candidate.profileId,
        status: 'excluded',
        reason: result.reason,
      }))
    );
  }

  if (eligibilityFailures.length > 0) {
    await db.insert(communitySmsRecipients).values(
      eligibilityFailures.map((result) => ({
        campaignId,
        profileId: result.candidate.profileId,
        status: 'failed',
        reason: result.reason,
      }))
    );
  }

  const sendResults = await mapConcurrent(
    eligible,
    SEND_CONCURRENCY,
    async (recipient) => {
      try {
        const sent = await ghl.sendSms(
          recipient.contactId,
          input.message,
          input.scheduledAt
        );
        return {
          campaignId,
          profileId: recipient.candidate.profileId,
          status: 'sent' as const,
          reason: sent.status,
          ghlMessageId: sent.id,
        };
      } catch (error) {
        console.error(
          `[community-sms] send failed for profile ${recipient.candidate.profileId}:`,
          error
        );
        return {
          campaignId,
          profileId: recipient.candidate.profileId,
          status: 'failed' as const,
          reason:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Unknown HighLevel error',
          ghlMessageId: null,
        };
      }
    }
  );

  if (sendResults.length > 0) {
    await db.insert(communitySmsRecipients).values(sendResults);
  }

  const sentCount = sendResults.filter(
    (result) => result.status === 'sent'
  ).length;
  const failedCount =
    eligibilityFailures.length + sendResults.length - sentCount;
  const status =
    sentCount === 0 && failedCount > 0
      ? 'failed'
      : failedCount > 0
        ? 'partial'
        : 'completed';

  const [campaign] = await db
    .update(communitySmsCampaigns)
    .set({
      status,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      sentCount,
      failedCount,
      updatedAt: new Date(),
    })
    .where(eq(communitySmsCampaigns.id, campaignId))
    .returning();

  if (!campaign)
    throw new Error('Campaign was sent but its record disappeared.');

  return {
    id: campaign.id,
    name: campaign.name,
    audience:
      COMMUNITY_AUDIENCES.find((item) => item.id === campaign.audience)?.name ??
      campaign.audience,
    createdAt: campaign.createdAt.toISOString(),
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    status: campaign.status,
    candidateCount: campaign.candidateCount,
    eligibleCount: campaign.eligibleCount,
    excludedCount: campaign.excludedCount,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
  };
}
