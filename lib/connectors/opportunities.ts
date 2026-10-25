import { and, desc, eq, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { db } from '@/lib/db';
import {
  connectorCommitments,
  connectorEvents,
  connectorOpportunities,
  events,
  profiles,
} from '@/lib/schema';
import { HOUSES, PODS } from '@/lib/connectors/model';
import { parseConnector } from '@/lib/connectors/membership';
import {
  assignableEventExists,
  isProgress,
  MAX_COMMITMENTS,
} from '@/lib/connectors/commitments';
import { eventColumns, parseEventValue } from '@/lib/connectors/event-link';
import type {
  ConnectorOpportunity,
  OpportunityCrewMember,
  OpportunityInput,
} from '@/lib/connectors/opportunities-model';
import { officialHostGroupId } from '@/lib/server/official-host';

type Result<T> =
  { ok: true; data: T } | { ok: false; status: 403 | 404 | 409; error: string };

const SIGNUPS = sql<number>`(
  select count(*)::int from ${connectorCommitments}
  where ${connectorCommitments.opportunityId} = ${connectorOpportunities.id}
)`;

export async function listOpportunities(): Promise<ConnectorOpportunity[]> {
  const hostGroupId = await officialHostGroupId();
  const now = new Date();
  const rows = await db
    .select({
      opportunity: connectorOpportunities,
      signups: SIGNUPS,
      publicTitle: events.title,
      publicStartsAt: events.startsAt,
      publicStatus: events.status,
      publicHostGroupId: events.hostGroupId,
      programmeTitle: connectorEvents.title,
      programmeStartsAt: connectorEvents.startsAt,
      programmeCancelledAt: connectorEvents.cancelledAt,
    })
    .from(connectorOpportunities)
    .leftJoin(events, eq(events.id, connectorOpportunities.eventId))
    .leftJoin(
      connectorEvents,
      eq(connectorEvents.id, connectorOpportunities.connectorEventId)
    )
    .orderBy(desc(connectorOpportunities.createdAt));

  return rows.map((row): ConnectorOpportunity => {
    const opportunity = row.opportunity;
    const house = HOUSES.find((item) => item.id === opportunity.house);
    const pod = PODS.find((item) => item.id === opportunity.pod);
    if (!house || (opportunity.pod !== null && !pod)) {
      throw new Error(
        `Invalid house or pod on connector opportunity ${opportunity.id}`
      );
    }
    const eventAvailable = opportunity.eventId
      ? Boolean(
          hostGroupId &&
          row.publicHostGroupId === hostGroupId &&
          row.publicStatus === 'published' &&
          row.publicStartsAt &&
          row.publicStartsAt >= now
        )
      : opportunity.connectorEventId
        ? Boolean(
            row.programmeStartsAt &&
            row.programmeStartsAt >= now &&
            !row.programmeCancelledAt
          )
        : true;

    return {
      id: opportunity.id,
      title: opportunity.title,
      details: opportunity.details,
      house: house.id,
      pod: pod?.id ?? null,
      when: opportunity.when,
      location: opportunity.location,
      estimatedMinutes: opportunity.estimatedMinutes,
      spots: opportunity.spots,
      eventId: opportunity.eventId,
      connectorEventId: opportunity.connectorEventId,
      eventTitle: row.publicTitle ?? row.programmeTitle,
      eventStartsAt:
        (row.publicStartsAt ?? row.programmeStartsAt)?.toISOString() ?? null,
      eventAvailable,
      closedAt: opportunity.closedAt?.toISOString() ?? null,
      createdAt: opportunity.createdAt.toISOString(),
      signups: row.signups,
    };
  });
}

/** Member identities are returned to the admin surface only, never HQ. */
export async function listOpportunityCrew(): Promise<OpportunityCrewMember[]> {
  const rows = await db
    .select({
      opportunityId: connectorCommitments.opportunityId,
      profileId: profiles.id,
      name: profiles.name,
      screenname: profiles.screenname,
      progress: connectorCommitments.progress,
    })
    .from(connectorCommitments)
    .innerJoin(profiles, eq(profiles.id, connectorCommitments.profileId))
    .where(sql`${connectorCommitments.opportunityId} is not null`)
    .orderBy(connectorCommitments.createdAt);
  return rows.flatMap((row) => {
    if (!row.opportunityId || !isProgress(row.progress)) return [];
    return [
      {
        opportunityId: row.opportunityId,
        profileId: row.profileId,
        displayName: row.name.trim() || row.screenname?.trim() || 'Connector',
        progress: row.progress,
      },
    ];
  });
}

export async function saveOpportunity(
  input: OpportunityInput,
  userId: string,
  id?: string
): Promise<Result<{ id: string }>> {
  // Resolve outside the transaction: the request's pool may have one connection.
  const hostGroupId = await officialHostGroupId();
  const choice = input.event ? parseEventValue(input.event) : null;
  return db.transaction(async (tx) => {
    if (id) {
      const [existing] = await tx
        .select({ id: connectorOpportunities.id })
        .from(connectorOpportunities)
        .where(eq(connectorOpportunities.id, id))
        .for('update');
      if (!existing)
        return {
          ok: false,
          status: 404,
          error: 'Could not find that opportunity.',
        };
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(connectorCommitments)
        .where(eq(connectorCommitments.opportunityId, id));
      if (input.spots !== null && input.spots < count.value) {
        return {
          ok: false,
          status: 409,
          error:
            'People have already committed. The crew target cannot be smaller than the current signups.',
        };
      }
      // Changing the event would leave existing commitments staffing the old one.
      const [current] = await tx
        .select()
        .from(connectorOpportunities)
        .where(eq(connectorOpportunities.id, id));
      const columns = eventColumns(choice);
      if (
        count.value > 0 &&
        (columns.eventId !== current.eventId ||
          columns.connectorEventId !== current.connectorEventId)
      ) {
        return {
          ok: false,
          status: 409,
          error:
            'This opportunity already has a crew. Close it and publish a new one to change its event.',
        };
      }
    }
    if (
      choice &&
      !(await assignableEventExists(choice.kind, choice.id, {
        database: tx,
        hostGroupId,
        lock: true,
      }))
    ) {
      return {
        ok: false,
        status: 409,
        error: 'That event is no longer open for connector work.',
      };
    }
    const { event: _event, ...fields } = input;
    const values = {
      ...fields,
      ...eventColumns(choice),
      updatedAt: new Date(),
    };
    if (id) {
      await tx
        .update(connectorOpportunities)
        .set(values)
        .where(eq(connectorOpportunities.id, id));
    } else {
      id = createId();
      await tx
        .insert(connectorOpportunities)
        .values({ ...values, id, createdBy: userId });
    }
    return { ok: true, data: { id } };
  });
}

export async function setOpportunityClosed(
  id: string,
  closed: boolean
): Promise<Result<{ id: string }>> {
  const hostGroupId = await officialHostGroupId();
  return db.transaction(async (tx) => {
    const [opportunity] = await tx
      .select()
      .from(connectorOpportunities)
      .where(eq(connectorOpportunities.id, id))
      .for('update');
    if (!opportunity)
      return {
        ok: false,
        status: 404,
        error: 'Could not find that opportunity.',
      };
    const choice = opportunity.eventId
      ? { kind: 'public' as const, id: opportunity.eventId }
      : opportunity.connectorEventId
        ? { kind: 'programme' as const, id: opportunity.connectorEventId }
        : null;
    if (
      !closed &&
      choice &&
      !(await assignableEventExists(choice.kind, choice.id, {
        database: tx,
        hostGroupId,
        lock: true,
      }))
    ) {
      return {
        ok: false,
        status: 409,
        error:
          'Its event is no longer available. Publish a new opportunity instead.',
      };
    }
    await tx
      .update(connectorOpportunities)
      .set({ closedAt: closed ? new Date() : null, updatedAt: new Date() })
      .where(eq(connectorOpportunities.id, id));
    return { ok: true, data: { id } };
  });
}

export async function joinOpportunity(
  userId: string,
  id: string
): Promise<Result<{ commitmentId: string; created: boolean }>> {
  const hostGroupId = await officialHostGroupId();
  return db.transaction(async (tx) => {
    // Serialize this person's board limit and membership with other signups.
    const [profile] = await tx
      .select({ id: profiles.id, connector: profiles.connector })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)
      .for('update');
    if (!profile || parseConnector(profile.connector)?.status !== 'active') {
      return {
        ok: false,
        status: 403,
        error: 'Only active connectors can pick up an opportunity.',
      };
    }
    // A separate statement after this lock observes the previous signup's commit.
    // A single INSERT/count CTE would retain its pre-lock snapshot and overbook.
    const [opportunity] = await tx
      .select()
      .from(connectorOpportunities)
      .where(eq(connectorOpportunities.id, id))
      .for('update');
    if (!opportunity)
      return {
        ok: false,
        status: 404,
        error: 'That opportunity is no longer here.',
      };
    const [existing] = await tx
      .select({ id: connectorCommitments.id })
      .from(connectorCommitments)
      .where(
        and(
          eq(connectorCommitments.profileId, profile.id),
          eq(connectorCommitments.opportunityId, id)
        )
      );
    if (existing)
      return { ok: true, data: { commitmentId: existing.id, created: false } };
    if (opportunity.closedAt)
      return {
        ok: false,
        status: 409,
        error: 'That opportunity has closed. Try another way to help.',
      };
    const choice = opportunity.eventId
      ? { kind: 'public' as const, id: opportunity.eventId }
      : opportunity.connectorEventId
        ? { kind: 'programme' as const, id: opportunity.connectorEventId }
        : null;
    if (
      choice &&
      !(await assignableEventExists(choice.kind, choice.id, {
        database: tx,
        hostGroupId,
        lock: true,
      }))
    ) {
      return {
        ok: false,
        status: 409,
        error: 'That event is no longer available for signup.',
      };
    }
    const [crew] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(connectorCommitments)
      .where(eq(connectorCommitments.opportunityId, id));
    if (opportunity.spots !== null && crew.count >= opportunity.spots) {
      return {
        ok: false,
        status: 409,
        error: 'The crew just filled up. Try another way to help.',
      };
    }
    const [board] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(connectorCommitments)
      .where(eq(connectorCommitments.profileId, profile.id));
    if (board.count >= MAX_COMMITMENTS) {
      return {
        ok: false,
        status: 409,
        error:
          'Your board has reached its storage limit. Remove an old self-directed commitment or ask a coordinator for help.',
      };
    }
    const commitmentId = createId();
    await tx.insert(connectorCommitments).values({
      id: commitmentId,
      profileId: profile.id,
      what: opportunity.title,
      when: opportunity.when,
      house: opportunity.house,
      estimatedMinutes: opportunity.estimatedMinutes,
      opportunityId: opportunity.id,
      eventId: opportunity.eventId,
      connectorEventId: opportunity.connectorEventId,
      progress: 'notSet',
    });
    return { ok: true, data: { commitmentId, created: true } };
  });
}
