import { button, emailLayout, escape, listingEmailStyles } from './layout';

export function listingClaim(params: Record<string, unknown>) {
  const businessName = String(params.businessName || 'your business');
  const claimUrl = String(params.claimUrl || '');
  const requesterEmail = String(params.requesterEmail || '');
  const instructions =
    'If that was you, use the same Pana account and confirm below. The link works once and expires in an hour. Claiming gives that account access to edit this business; it does not change your personal login.';
  const reviewGuidance =
    'If you are completing a listing review, finish with "Confirm business information" after claiming. A valid US ZIP and a saved primary business photo are required. An existing primary photo counts; you do not need to upload it again. Gallery photos are optional.';
  const safety =
    "If you don't recognise this, ignore this email and nothing changes. Whoever asked cannot get access without this link.";

  return {
    subject: `Confirm you run ${String(params.businessName || 'this business')} — PanaMia`,
    html: emailLayout({
      variant: 'listing',
      title: 'Confirm you manage this listing',
      preheader: `Confirm you manage ${businessName} on PanaMia.`,
      body: `
        <h1 class="listing-heading" style="${listingEmailStyles.heading}">Confirm you manage this listing</h1>
        <p style="${listingEmailStyles.paragraph}">
          Someone signed in as <strong>${escape(requesterEmail)}</strong> and asked to manage the PanaMia listing for <strong>${escape(businessName)}</strong>.
        </p>
        <p style="${listingEmailStyles.paragraph}">${escape(instructions)}</p>
        ${button('Yes, this is my business', claimUrl, 'listing')}
        <p style="${listingEmailStyles.note}">${escape(reviewGuidance)}</p>
        <p style="${listingEmailStyles.note}">${escape(safety)}</p>`,
    }),
    text: [
      'Confirm you manage this listing - PanaMia',
      '',
      `Someone signed in as ${requesterEmail} and asked to manage`,
      `the PanaMia listing for ${businessName}.`,
      '',
      instructions,
      'Yes, this is my business:',
      claimUrl,
      '',
      reviewGuidance,
      safety,
      '',
      '---',
      'PanaMia - panamia.club - hola@panamia.club',
    ].join('\n'),
  };
}
