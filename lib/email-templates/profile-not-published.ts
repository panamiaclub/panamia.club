import { emailLayout, escape } from './layout';

export function profileNotPublished(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));

  return {
    subject: 'Profile Update — Pana MIA',
    html: emailLayout({
      title: 'Profile Update',
      preheader: 'An update about your profile submission.',
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Profile Update</h2>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Hi ${name}, thank you for submitting your profile to Pana MIA.
        </p>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          After review, we were unable to approve your profile at this time. This could be due to incomplete information or content that doesn't meet our community guidelines.
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          If you have questions, please reach out to us at <a href="mailto:hola@panamia.club" style="color: #4ab3ea;">hola@panamia.club</a>.
        </p>`,
    }),
    text: [
      'Profile Update — Pana MIA',
      '=========================',
      '',
      `Hi ${String(params.name || '')},`,
      '',
      'Thank you for submitting your profile to Pana MIA.',
      '',
      'After review, we were unable to approve your profile at this time.',
      "This could be due to incomplete information or content that doesn't meet our community guidelines.",
      '',
      'If you have questions, please reach out to us at hola@panamia.club.',
      '',
      '---',
      'Pana MIA · panamia.club · hola@panamia.club',
    ].join('\n'),
  };
}
