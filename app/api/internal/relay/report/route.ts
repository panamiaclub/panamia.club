import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { relayReports } from '@/lib/schema';
import { notifyAdminsOfReport } from '@/lib/server/relay-reports';
import { denyPublicRequest } from '@/lib/server/internal-auth';

// NIP-56 abuse-report endpoint. Receives kind 1984 reports forwarded from
// relay.panamia.club and records them for the admin moderation console.
//
// Reached only via Cloudflare Service Binding from panamia-nosflare
// (env.PANAMIA.fetch). Service Bindings bypass the public network, so no
// HTTP-level auth is enforced here. Caller is panamia-nosflare's
// forwardReportToPana() in external/nosflare/src/relay-worker.ts.
//
// Contract notes (see docs/RELAY-ABUSE-REPORTS-ROADMAP.MD):
//   - The relay forwards FIRE-AND-FORGET and ignores this response. A 2xx vs
//     4xx only matters for the relay's error log; the report is already a
//     durable public NIP-56 event on the relay regardless.
//   - Reports are accepted from ANYONE (member or not), so there is no
//     membership check and no FK to profiles.
//   - Inserts are deduped on (reporter_pubkey, target_pubkey, target_event_id,
//     report_type) for queue readability — NOT as an abuse control. A repeat
//     report from the same reporter against the same target is a no-op.
//
// =============================================================================

interface ReportRequest {
  event_id: string;
  reporter_pubkey: string;
  target_pubkey: string | null;
  target_event_id: string | null;
  report_type: string | null;
  content: string;
  created_at: number;
  // Snapshot of the reported event (e-tag target), supplied by the relay from
  // its own storage. Optional.
  reported_content: string | null;
  reported_kind: number | null;
}

interface ReportResponse {
  stored: boolean;
  reason?: string;
}

const isHex64 = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);
const REPORT_TYPE_MAX = 64;
const CONTENT_MAX = 4096;
// Reported event content can be a full long-form article. Snapshot only the
// first 100 words for moderation context; HARD_CAP backstops pathological
// whitespace-free input before the word split.
const REPORTED_CONTENT_MAX_WORDS = 100;
const REPORTED_CONTENT_HARD_CAP = 20000;

function truncateWords(s: string, maxWords: number): string {
  const trimmed = s.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return words.slice(0, maxWords).join(' ') + ' …';
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ReportResponse>> {
  // Refuse anything arriving from the public edge — see
  // lib/server/internal-auth.ts. The relay's Service Binding is unaffected.
  const denied = denyPublicRequest<ReportResponse>(request);
  if (denied) return denied;

  let body: Partial<ReportRequest>;
  try {
    body = (await request.json()) as Partial<ReportRequest>;
  } catch {
    return NextResponse.json(
      { stored: false, reason: 'invalid: malformed json' },
      { status: 400 }
    );
  }

  const {
    event_id,
    reporter_pubkey,
    target_pubkey,
    target_event_id,
    report_type,
    content,
    created_at,
    reported_content,
    reported_kind,
  } = body;

  // event_id and reporter_pubkey are mandatory and must be valid hex.
  if (!event_id || !isHex64(event_id)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: event_id' },
      { status: 400 }
    );
  }
  if (!reporter_pubkey || !isHex64(reporter_pubkey)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: reporter_pubkey' },
      { status: 400 }
    );
  }
  // Targets are optional, but if present must be valid hex.
  if (target_pubkey != null && !isHex64(target_pubkey)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: target_pubkey' },
      { status: 400 }
    );
  }
  if (target_event_id != null && !isHex64(target_event_id)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: target_event_id' },
      { status: 400 }
    );
  }
  if (typeof created_at !== 'number' || !Number.isFinite(created_at)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: created_at' },
      { status: 400 }
    );
  }

  // report_type and content are free text from the reporter — clamp length
  // and coerce to the column shape. We store unknown report types verbatim.
  const reportType =
    typeof report_type === 'string' && report_type.length > 0
      ? report_type.slice(0, REPORT_TYPE_MAX)
      : null;
  const reportContent =
    typeof content === 'string' ? content.slice(0, CONTENT_MAX) : '';
  const reportedContent =
    typeof reported_content === 'string'
      ? truncateWords(
          reported_content.slice(0, REPORTED_CONTENT_HARD_CAP),
          REPORTED_CONTENT_MAX_WORDS
        )
      : null;
  const reportedKind =
    typeof reported_kind === 'number' && Number.isFinite(reported_kind)
      ? reported_kind
      : null;
  const reportedAt = new Date(created_at * 1000);

  const inserted = await db
    .insert(relayReports)
    .values({
      eventId: event_id,
      reporterPubkey: reporter_pubkey,
      targetPubkey: target_pubkey ?? null,
      targetEventId: target_event_id ?? null,
      reportType,
      content: reportContent,
      reportedContent,
      reportedKind,
      reportedAt,
    })
    // Dedup: a repeat report of the same target+type by the same reporter is
    // a no-op. Does not reset status/received_at on the existing row.
    .onConflictDoNothing({
      target: [
        relayReports.reporterPubkey,
        relayReports.targetPubkey,
        relayReports.targetEventId,
        relayReports.reportType,
      ],
    })
    .returning({ id: relayReports.id });

  // Email the admin team only for genuinely new reports — onConflictDoNothing
  // returns an empty array on a deduped repeat, so this stays quiet then.
  // Best-effort; notifyAdminsOfReport never throws.
  if (inserted.length > 0) {
    await notifyAdminsOfReport({
      eventId: event_id,
      reporterPubkey: reporter_pubkey,
      targetPubkey: target_pubkey ?? null,
      targetEventId: target_event_id ?? null,
      reportType,
      content: reportContent,
      reportedContent,
      reportedKind,
      reportedAt,
    });
  }

  return NextResponse.json({ stored: true });
}
