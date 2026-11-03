import { button, emailLayout, escape, listingEmailStyles } from './layout';

export function listingRefresh(params: Record<string, unknown>) {
  const name = String(params.businessName || 'your business');
  const reviewUrl = String(params.reviewUrl || '');
  const stopUrl = String(params.stopUrl || '');
  const deadline = String(params.deadline || '');
  const deliveryId = String(params.deliveryId || '');
  const final = params.finalNotice === true;
  const reminder = params.reminderNotice === true;
  const title = final
    ? 'A last reminder for your listing'
    : reminder
      ? 'A friendly reminder to review your listing'
      : "Let's refresh your business listing.";
  const intro = final
    ? 'This is the last scheduled reminder to review your business information in the PanaMia directory.'
    : reminder
      ? 'A friendly follow-up: please review your business information in the refreshed PanaMia directory.'
      : "We've refreshed the PanaMia directory to help people discover South Florida businesses like yours. We'd love you to make sure your listing tells the right story.";
  const reason =
    'You are receiving this because this inbox is the business contact or belongs to an account that manages an existing PanaMia listing.';
  const copy = final
    ? `This is the final weekly reminder. Your listing may be temporarily hidden after ${deadline} if you have not confirmed its information. This is a temporary pause, not a deletion.`
    : `We will remind you weekly until you confirm. Your listing may be temporarily hidden after ${deadline} if we do not hear from you. This is a temporary pause, not a deletion.`;
  const confirmation =
    'Signing in or claiming alone does not finish the review. At the end, choose "Confirm business information" to complete it.';
  const reviewGuidance =
    'Check your description, category, photos and links. Add a customer-facing location or ZIP only if appropriate. No private home address or invented ZIP is required.';
  const accountGuidance =
    'Already manage this listing? Use the Pana account that manages it. If it is unclaimed, verify access to the business inbox and choose your own Pana account. Your personal login email can be different from the business contact.';
  const invitationGuidance =
    'Private invitation links work once and expire after seven days. If a link expires or you cannot access the business inbox, reply for help.';
  const recovery =
    'If your listing is paused because we have not heard from you, an authorized manager can review and confirm it to restore it. Staff decisions remain separate.';
  const stopGuidance =
    'Stopping reminders does not confirm your listing and is not treated as an ignored notice. You can also reply for help.';
  const subject = final
    ? `Final listing reminder: ${name} - PanaMia`
    : reminder
      ? `Listing review reminder: ${name} - PanaMia`
      : `Review your PanaMia listing: ${name}`;
  return {
    subject,
    html: emailLayout({
      variant: 'listing',
      title,
      preheader: `Please review ${name} and confirm its information by ${deadline}.`,
      body: `<h1 class="listing-heading" style="${listingEmailStyles.heading}">${escape(title)}</h1>
        <p style="${listingEmailStyles.paragraph}">Hola ${escape(name)} team,</p>
        <p style="${listingEmailStyles.paragraph}">${escape(intro)}</p>
        <p style="${listingEmailStyles.note}">${escape(reason)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="#fbf7d2" style="width:100%;margin:8px 0 16px;background-color:#fbf7d2;border:1px solid #e7dfaa;border-radius:16px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 8px;color:#110d0d;font-size:12px;line-height:1.5;font-weight:700;">YOUR DIRECTORY LISTING</p>
              <p style="margin:0 0 8px;color:#110d0d;font-size:22px;line-height:1.3;font-weight:700;">${escape(name)}</p>
              <p style="margin:0;color:#110d0d;font-size:16px;line-height:1.6;">Please confirm by <strong>${escape(deadline)}</strong>.</p>
            </td>
          </tr>
        </table>
        ${button('Review and confirm my listing', reviewUrl, 'listing')}
        <p style="${listingEmailStyles.note}">${escape(confirmation)}</p>
        <h2 style="margin:24px 0 12px;color:#110d0d;font-size:20px;line-height:1.4;">A few things worth checking</h2>
        <p style="${listingEmailStyles.paragraph}">${escape(reviewGuidance)}</p>
        <h2 style="margin:24px 0 12px;color:#110d0d;font-size:20px;line-height:1.4;">Using your review link</h2>
        <p style="${listingEmailStyles.note}">${escape(accountGuidance)}</p>
        <p style="${listingEmailStyles.note}">${escape(invitationGuidance)}</p>
        <p style="${listingEmailStyles.paragraph}">${escape(copy)}</p>
        <p style="${listingEmailStyles.note}">${escape(recovery)}</p>
        <p style="${listingEmailStyles.paragraph}">Thanks for being part of our local community,<br><strong>The PanaMia team</strong></p>
        <p style="margin:24px 0 12px;padding-top:20px;border-top:1px solid #dfd3c2;color:#110d0d;font-size:14px;line-height:1.65;"><a href="${escape(stopUrl)}" rel="noreferrer" referrerpolicy="no-referrer" style="${listingEmailStyles.link}">Stop listing-review reminders</a><br>${escape(stopGuidance)}</p>
        <p style="margin:0;color:#110d0d;font-size:12px;line-height:1.6;">Reference: ${escape(deliveryId)}</p>`,
    }),
    text: [
      title,
      '',
      `Hola ${name} team,`,
      '',
      intro,
      reason,
      '',
      'Your directory listing:',
      name,
      `Please confirm by ${deadline}.`,
      '',
      'Review and confirm my listing:',
      reviewUrl,
      confirmation,
      '',
      'A few things worth checking',
      reviewGuidance,
      '',
      'Using your review link',
      accountGuidance,
      invitationGuidance,
      '',
      copy,
      recovery,
      '',
      'Thanks for being part of our local community,',
      'The PanaMia team',
      '',
      'Stop listing-review reminders:',
      stopUrl,
      stopGuidance,
      '',
      `Reference: ${deliveryId}`,
      '',
      'PanaMia - panamia.club - hola@panamia.club',
    ].join('\n'),
  };
}
