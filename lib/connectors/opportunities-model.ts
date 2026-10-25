import { z } from 'zod';

import { HOUSES, PODS } from '@/lib/connectors/model';
import type {
  CommitmentProgress,
  HouseId,
  PodId,
} from '@/lib/connectors/model';
import { MAX_MINUTES } from '@/lib/connectors/hours';
import { parseEventValue } from '@/lib/connectors/event-link';

export const OPPORTUNITY_TITLE_MAX = 150;
export const OPPORTUNITY_DETAILS_MAX = 2000;
export const OPPORTUNITY_LOCATION_MAX = 250;
export const OPPORTUNITY_SPOTS_MAX = 9999;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .default(null);

export const opportunityInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the opportunity a title.')
    .max(OPPORTUNITY_TITLE_MAX),
  details: z
    .string()
    .trim()
    .min(1, 'Add enough context for someone to say yes.')
    .max(OPPORTUNITY_DETAILS_MAX),
  house: z.custom<HouseId>(
    (value) => HOUSES.some((house) => house.id === value),
    'Choose a house.'
  ),
  pod: z
    .custom<PodId | null>(
      (value) => value === null || PODS.some((pod) => pod.id === value),
      'Choose a pod, or make it programme-wide.'
    )
    .default(null),
  when: optionalText(120),
  location: optionalText(OPPORTUNITY_LOCATION_MAX),
  estimatedMinutes: z
    .number()
    .int()
    .min(1)
    .max(MAX_MINUTES)
    .nullable()
    .default(null),
  spots: z
    .number()
    .int()
    .min(1)
    .max(OPPORTUNITY_SPOTS_MAX)
    .nullable()
    .default(null),
  event: z
    .string()
    .nullable()
    .default(null)
    .refine(
      (value) => value === null || parseEventValue(value) !== null,
      'Choose a valid event.'
    ),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export interface ConnectorOpportunity {
  id: string;
  title: string;
  details: string;
  house: HouseId;
  pod: PodId | null;
  when: string | null;
  location: string | null;
  estimatedMinutes: number | null;
  spots: number | null;
  eventId: string | null;
  connectorEventId: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  eventAvailable: boolean;
  closedAt: string | null;
  createdAt: string;
  /** Includes completed work: finishing does not offer your agreed spot again. */
  signups: number;
}

export interface OpportunityCrewMember {
  opportunityId: string;
  profileId: string;
  displayName: string;
  progress: CommitmentProgress;
}

export function spotsRemaining(
  opportunity: Pick<ConnectorOpportunity, 'spots' | 'signups'>
): number | null {
  return opportunity.spots === null
    ? null
    : Math.max(0, opportunity.spots - opportunity.signups);
}

export function opportunityStatus(
  opportunity: ConnectorOpportunity
): 'open' | 'full' | 'closed' | 'unavailable' {
  if (opportunity.closedAt) return 'closed';
  if (!opportunity.eventAvailable) return 'unavailable';
  return spotsRemaining(opportunity) === 0 ? 'full' : 'open';
}

export function matchesOpportunity(
  opportunity: ConnectorOpportunity,
  filters: { house: string; pod: string; query: string },
  myPod?: PodId
): boolean {
  const pod = filters.pod === 'mine' ? myPod : filters.pod;
  const query = filters.query.trim().toLowerCase();
  return (
    (filters.house === 'all' || opportunity.house === filters.house) &&
    (filters.pod === 'all' ||
      opportunity.pod === null ||
      opportunity.pod === pod) &&
    (!query ||
      `${opportunity.title} ${opportunity.details} ${HOUSES.find((house) => house.id === opportunity.house)?.name ?? ''}`
        .toLowerCase()
        .includes(query))
  );
}
