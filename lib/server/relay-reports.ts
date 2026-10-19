import { db } from '@/lib/db';
import { profiles, users } from '@/lib/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { adminEmailList } from '@/lib/server/admin-emails';
import { kindName } from '@/lib/nostr/kinds';
import { npubFromHex } from '@/lib/nostr/keys';

// Shared helpers for NIP-56 abuse reports forwarded into relay_reports:
// resolving reporter/target pubkeys to panamia screennames, and emailing the
// admin team when a new report arrives.

export interface ReportForEmail {
  eventId: string;
  reporterPubkey: string;
  targetPubkey: string | null;
  targetEventId: string | null;
  reportType: string | null;
  content: string;
  reportedContent: string | null;
  reportedKind: number | null;
  reportedAt: Date;
}

/**
 * Resolve a set of hex pubkeys to panamia screennames in one query.
 * Returns a map of (lowercased hex pubkey) -> screenname; pubkeys with no
 * panamia profile are simply absent from the map.
 */
export async function lookupScreennames(
  pubkeys: Array<string | null | undefined>
): Promise<Record<string, string>> {
  const unique = [
    ...new Set(
      pubkeys.filter((p): p is string => !!p).map((p) => p.toLowerCase())
    ),
  ];
  if (unique.length === 0) return {};

  const rows = await db
    .select({ pubkey: profiles.nostrPubkey, screenname: users.screenname })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(inArray(profiles.nostrPubkey, unique));

  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.pubkey && r.screenname) map[r.pubkey.toLowerCase()] = r.screenname;
  }

  // The relay's own signing key is not a user profile, so reports targeting
  // relay-published content (e.g. crossposted articles) would otherwise read
  // "no panamia profile". Label it when RELAY_PUBLIC_KEY is configured.
  const relayPubkey = process.env.RELAY_PUBLIC_KEY?.toLowerCase();
  if (relayPubkey && unique.includes(relayPubkey) && !map[relayPubkey]) {
    map[relayPubkey] = 'relay.panamia.club';
  }
  return map;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortHex(hex: string): string {
  return hex.length > 16 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex;
}

// Renders a pubkey as "screenname (npub1…)" when we know the name, else
// "npub1… (no panamia profile)", showing the FULL npub (no truncation) so an
// operator can copy and verify the exact key from the email. Falls back to raw
// hex if npub encoding fails.
function describePubkey(
  hex: string | null,
  names: Record<string, string>
): string {
  if (!hex) return '—';
  let npub: string;
  try {
    npub = npubFromHex(hex);
  } catch {
    npub = hex;
  }
  const name = names[hex.toLowerCase()];
  return name ? `${name} (${npub})` : `${npub} (no panamia profile)`;
}

function buildReportEmail(
  report: ReportForEmail,
  names: Record<string, string>
): { subject: string; html: string; text: string } {
  const reporter = describePubkey(report.reporterPubkey, names);
  const target = describePubkey(report.targetPubkey, names);
  const type = report.reportType || 'unspecified';
  const reportedKindLabel =
    report.reportedKind != null ? kindName(report.reportedKind) : '—';
  const adminUrl =
    (process.env.NEXT_PUBLIC_HOST_URL || 'https://daydream.panamia.club') +
    '/admin/reports';

  const subject = `[Pana abuse report] ${type} — reported by ${
    names[report.reporterPubkey.toLowerCase()] ||
    shortHex(report.reporterPubkey)
  }`;

  const reportedBlock = report.reportedContent
    ? `<blockquote style="margin:0;padding:12px 16px;background:#f5f5f5;border-left:4px solid #ec4899;border-radius:4px;white-space:pre-wrap;font-size:14px;color:#222;">${escapeHtml(
        report.reportedContent
      )}</blockquote>`
    : '<em style="color:#888;">(not captured — no e-tag, or the relay did not hold the event)</em>';

  const rows: Array<[string, string]> = [
    ['Report type', escapeHtml(type)],
    ['Reporter', escapeHtml(reporter)],
    ['Target account', escapeHtml(target)],
    [
      'Reported event',
      report.targetEventId
        ? `${report.targetEventId} — ${escapeHtml(reportedKindLabel)}`
        : '—',
    ],
    ['Reported at', report.reportedAt.toISOString()],
    ['Report event id', report.eventId],
  ];

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:4px 0;color:#111;">${v}</td></tr>`
    )
    .join('');

  // The NCMEC mandatory-reporting notice applies only to categories that can
  // implicate child sexual abuse material — nudity/graphic content and illegal
  // behavior. Other types (spam, malware, impersonation, profanity, …) are
  // unrelated, so the notice is omitted for them.
  const showNcmec = ['nudity', 'illegal'].includes(
    (report.reportType || '').toLowerCase()
  );
  const ncmecHtml = showNcmec
    ? `<div style="margin:24px 0 0;padding:14px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:#991b1b;">
      <strong>Mandatory-reporting notice:</strong> if this report concerns nudity or sexual content and there is <em>any</em> indication a minor is involved, it must be reported to the National Center for Missing &amp; Exploited Children (NCMEC) as soon as possible — and no later than 60 days — per 18 U.S.C. &sect; 2258A and the REPORT Act. File at
      <a href="https://report.cybertip.org" style="color:#dc2626;">report.cybertip.org</a>. Removal from public access (including via &ldquo;Remove from Relay&rdquo;) is permitted only after a copy has been preserved for the legally required retention period; the original material must not be destroyed prior to reporting and preservation.
    </p>
  </div>`
    : '';
  const ncmecText = showNcmec
    ? [
        '',
        'MANDATORY-REPORTING NOTICE: if this report concerns nudity or sexual',
        'content and there is any indication a minor is involved, it must be',
        'reported to the National Center for Missing & Exploited Children (NCMEC)',
        'as soon as possible, and no later than 60 days, per 18 U.S.C. § 2258A and',
        'the REPORT Act. File at https://report.cybertip.org. Removal from public',
        'access (including via "Remove from Relay") is permitted only after a copy',
        'has been preserved for the legally required retention period; the original',
        'material must not be destroyed prior to reporting and preservation.',
      ]
    : [];

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 4px;font-size:20px;">New abuse report</h2>
  <p style="margin:0 0 20px;color:#666;font-size:14px;">A NIP-56 report was filed on relay.panamia.club.</p>
  <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px;">${tableRows}</table>
  <h3 style="margin:0 0 6px;font-size:15px;">Reporter's context</h3>
  <p style="margin:0 0 20px;white-space:pre-wrap;font-size:14px;">${
    report.content
      ? escapeHtml(report.content)
      : '<em style="color:#888;">(none provided)</em>'
  }</p>
  <h3 style="margin:0 0 6px;font-size:15px;">Reported original content</h3>
  ${reportedBlock}
  ${ncmecHtml}
  <p style="margin:24px 0 0;font-size:14px;"><a href="${adminUrl}" style="color:#ec4899;">Open the moderation queue →</a></p>
</body></html>`;

  const text = [
    'New abuse report on relay.panamia.club',
    '',
    ...rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, '')}`),
    '',
    "Reporter's context:",
    report.content || '(none provided)',
    '',
    'Reported original content:',
    report.reportedContent || '(not captured)',
    ...ncmecText,
    '',
    `Moderation queue: ${adminUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/**
 * Everyone who should hear about a new abuse report.
 *
 * The union of ADMIN_EMAILS and every account holding `roles.admin` or
 * `roles.contentModerator`, deduplicated case-insensitively.
 *
 * ## The invariant
 *
 * Who gets mailed must equal who can act on the report. This used to be
 * ADMIN_EMAILS alone, which broke that in both directions: a column-granted
 * admin could work the queue but never heard a report had arrived, and the
 * only way to start mailing somebody was to add them to the secret that
 * decides who may grant admin — so putting a volunteer on the rota meant
 * handing them the power to make anybody an admin. The role now carries the
 * notification, and `checkModeratorAuth` reads the same two fields this query
 * does.
 *
 * ADMIN_EMAILS is still unioned in rather than dropped: that tier is admin by
 * definition, and a founder address need not have a `profiles` row at all —
 * querying the column alone could mail nobody on a site that has admins.
 *
 * The email comes from `users`, not `profiles`: `profiles.email` is the
 * public-facing business address and may be a shared inbox nobody reads.
 *
 * Never throws. A database that is unreachable degrades to the env list rather
 * than losing the report notification entirely.
 */
export async function moderationTeamEmails(): Promise<string[]> {
  let granted: string[] = [];
  try {
    const rows = await db
      .select({ email: users.email })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(
        sql`${profiles.roles} ->> 'admin' = 'true' or ${profiles.roles} ->> 'contentModerator' = 'true'`
      );
    granted = rows.map((row) => row.email).filter(Boolean);
  } catch (err) {
    console.error('Failed to read the moderation rota:', err);
  }

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of [...adminEmailList(), ...granted]) {
    const address = raw.trim();
    const key = address.toLowerCase();
    if (!address || seen.has(key)) continue;
    seen.add(key);
    recipients.push(address);
  }
  return recipients;
}

/**
 * Email the moderation team about a newly received report. Best-effort:
 * resolves names, builds the message, and sends to each recipient
 * independently; never throws (callers must not let notification failure break
 * ingest).
 *
 * Separate sends rather than one message with many recipients: the rota can
 * include volunteers, and a shared To: header would disclose their addresses
 * to each other.
 */
export async function notifyAdminsOfReport(
  report: ReportForEmail
): Promise<void> {
  try {
    const admins = await moderationTeamEmails();
    if (admins.length === 0) return;

    const names = await lookupScreennames([
      report.reporterPubkey,
      report.targetPubkey,
    ]);
    const { subject, html, text } = buildReportEmail(report, names);

    await Promise.allSettled(
      admins.map((to) => sendEmail(to, subject, html, text))
    );
  } catch (err) {
    console.error('Failed to notify admins of abuse report:', err);
  }
}
