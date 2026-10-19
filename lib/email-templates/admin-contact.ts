import { emailLayout, escape, button } from './layout';

/**
 * Staff notification for a new Contact Us submission. See
 * docs/CONTACT-ROADMAP.md, "Notifications".
 *
 * Deliberately a POINTER, not a copy: sender, category, submission ID, and a
 * link into the admin queue. The message body is not reproduced here. That is
 * not squeamishness about volume — the body is attacker-controlled text from
 * an address nobody confirmed, and mailing it to staff under our own DKIM
 * signature is the same lure the sender receipt (contact-received.ts) is
 * carefully built to defuse. Staff read it in the queue, in context, where the
 * status controls are.
 *
 * `Reply-To` is set to the sender by the caller, so replying reaches the person
 * who wrote in rather than the shared sending address.
 */
export function adminContact(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));
  const email = escape(String(params.email || ''));
  const category = escape(String(params.category || 'General question'));
  const submissionId = escape(String(params.submissionId || ''));
  const queueUrl = String(params.queueUrl || '');
  const screenname = params.screenname ? String(params.screenname) : '';
  const isAuthenticated = Boolean(params.isAuthenticated);

  const senderLabel = isAuthenticated
    ? `signed in${screenname ? ` as ${screenname}` : ''}`
    : 'not signed in — address unverified';

  const subject = `[Contact Us] ${String(params.category || 'General question')} — ${String(
    params.name || 'Unknown'
  )}${isAuthenticated ? '' : ' (unverified)'}`;

  const rows: Array<[string, string]> = [
    ['Category', category],
    ['From', `${name} &lt;${email}&gt;`],
    ['Sender', escape(senderLabel)],
    ['Submission ID', submissionId],
  ];

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding: 8px 16px 8px 0; color: #6b7280; font-size: 14px; width: 130px; vertical-align: top; white-space: nowrap;">${k}</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${v}</td></tr>`
    )
    .join('');

  const unverifiedNotice = isAuthenticated
    ? ''
    : `<div style="margin: 0 0 24px 0; padding: 14px 18px; background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; color: #92400e; font-size: 14px; line-height: 1.6;">
          This was submitted by someone who was <strong>not signed in</strong>, so
          the name and address above are whatever they typed. Treat them as
          unverified until something else corroborates them.
        </div>`;

  return {
    subject,
    html: emailLayout({
      title: 'New Contact Us submission',
      // Unescaped by contract — emailLayout escapes title and preheader.
      preheader: `${String(params.category || '')} — from ${String(params.name || '')}`,
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">New Contact Us submission</h2>
        ${unverifiedNotice}
        <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">${tableRows}</table>
        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          The message itself is in the admin queue, not in this email. Replying
          to this notification reaches the sender directly.
        </p>
        ${button('Open the Contact Us queue', queueUrl)}`,
    }),
    text: [
      '[Contact Us] New submission',
      '===========================',
      '',
      ...(isAuthenticated
        ? []
        : [
            'NOTE: submitted by someone who was NOT signed in — the name and',
            'address below are whatever they typed, and are unverified.',
            '',
          ]),
      `Category: ${String(params.category || '')}`,
      `From: ${String(params.name || '')} <${String(params.email || '')}>`,
      `Sender: ${senderLabel}`,
      `Submission ID: ${String(params.submissionId || '')}`,
      '',
      'The message itself is in the admin queue, not in this email.',
      'Replying to this notification reaches the sender directly.',
      '',
      `Queue: ${queueUrl}`,
      '',
      '---',
      'Pana MIA · panamia.club',
    ].join('\n'),
  };
}
