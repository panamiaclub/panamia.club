import { emailLayout, escape } from './layout';

export function listingClaim(params: Record<string, unknown>) {
  const businessName = escape(String(params.businessName || 'your business'));
  const claimUrl = String(params.claimUrl || '');
  const requesterEmail = escape(String(params.requesterEmail || ''));

  return {
    subject: `Confirm you run ${String(params.businessName || 'this business')} — Pana MIA`,
    html: emailLayout({
      title: 'Claim your listing',
      preheader: `Confirm you manage ${businessName} on Pana MIA.`,
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Claim your listing</h2>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Someone signed in as <strong>${requesterEmail}</strong> and asked to manage the Pana MIA listing for <strong>${businessName}</strong>.
        </p>
        <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          If that was you, confirm below and the listing is yours to edit. The link works once and expires in an hour.
        </p>
        <p style="margin: 0 0 24px 0;">
          <a href="${escape(claimUrl)}" style="display: inline-block; background-color: #f28444; color: #1f2937; padding: 14px 28px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 16px;">Yes, this is my business</a>
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          If you don't recognise this, ignore this email and nothing changes. Whoever asked cannot get access without this link.
        </p>`,
    }),
    text: [
      'Claim your listing — Pana MIA',
      '=============================',
      '',
      `Someone signed in as ${String(params.requesterEmail || '')} and asked to manage`,
      `the Pana MIA listing for ${String(params.businessName || 'this business')}.`,
      '',
      'If that was you, confirm here. The link works once and expires in an hour:',
      claimUrl,
      '',
      "If you don't recognise this, ignore this email and nothing changes.",
      'Whoever asked cannot get access without this link.',
      '',
      '---',
      'Pana MIA · panamia.club · hola@panamia.club',
    ].join('\n'),
  };
}
