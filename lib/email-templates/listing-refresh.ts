import { emailLayout, escape } from './layout';

export function listingRefresh(params: Record<string, unknown>) {
  const name = String(params.businessName || 'your business');
  const reviewUrl = String(params.reviewUrl || '');
  const stopUrl = String(params.stopUrl || '');
  const deadline = String(params.deadline || '');
  const final = params.finalNotice === true;
  const title = final
    ? 'Last reminder to confirm your listing'
    : 'Review and confirm your listing';
  const copy = final
    ? `Your listing may be hidden after ${deadline} unless you confirm its information. This is a temporary pause, not a deletion.`
    : `Please confirm your business information by ${deadline}. We will remind you weekly; an unconfirmed listing may be temporarily hidden after the response window.`;
  return {
    subject: `${final ? 'Final listing reminder' : 'Confirm your listing'}: ${name} - Pana MIA`,
    html: emailLayout({
      title,
      preheader: copy,
      body: `<h2>${escape(title)}</h2>
        <p>Please review <strong>${escape(name)}</strong> on Pana MIA.</p>
        <p>${escape(copy)}</p>
        <p>Signing in or claiming alone does not finish the review. Confirm the listing details at the end. You do not need to publish a home address or invent a ZIP.</p>
        <p><a href="${escape(reviewUrl)}" style="display:inline-block;background:#f28444;color:#1f2937;padding:14px 24px;border-radius:999px;font-weight:700;text-decoration:none">Review and confirm my listing</a></p>
        <p>If the business is already claimed, use the Pana account that manages it. Otherwise, verify the business inbox and choose your own Pana account. Private invitation links work for seven days.</p>
        <p>A listing paused for nonresponse can be restored after an authorized review. Staff decisions remain separate.</p>
        <p><a href="${escape(stopUrl)}">Stop listing-review reminders</a>. Opting out is handled separately, not treated as an ignored reminder. You can also reply for help.</p>
        <p style="font-size:12px;color:#6b7280">Reference: ${escape(String(params.deliveryId || ''))}</p>`,
    }),
    text: [
      title,
      '',
      name,
      copy,
      '',
      'Signing in or claiming alone does not finish the review. Confirm the listing details at the end.',
      'No private home address or invented ZIP is required.',
      '',
      reviewUrl,
      '',
      'Use the Pana account that manages the business, or verify the business inbox and choose your own account.',
      'Private invitation links work for seven days. Staff decisions remain separate.',
      '',
      'Stop listing-review reminders:',
      stopUrl,
      '',
      `Reference: ${String(params.deliveryId || '')}`,
    ].join('\n'),
  };
}
