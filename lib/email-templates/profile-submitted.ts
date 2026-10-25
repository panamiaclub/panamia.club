import { emailLayout, escape } from './layout';

export function profileSubmitted(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));

  return {
    subject: 'Profile Submitted — Pana MIA',
    html: emailLayout({
      title: 'Profile Submitted',
      preheader: 'Your profile has been submitted for review.',
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Profile Submitted</h2>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Hi ${name}! Your profile has been submitted and is now under review.
        </p>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          We'll review your submission and get back to you soon. You'll receive another email once your profile has been approved.
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          Thank you for joining our community!
        </p>`,
    }),
    text: [
      'Profile Submitted — Pana MIA',
      '============================',
      '',
      `Hi ${String(params.name || '')}!`,
      '',
      'Your profile has been submitted and is now under review.',
      "We'll review your submission and get back to you soon.",
      '',
      'Thank you for joining our community!',
      '',
      '---',
      'Pana MIA · panamia.club · hola@panamia.club',
    ].join('\n'),
  };
}
