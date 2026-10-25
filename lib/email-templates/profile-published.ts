import { emailLayout, escape } from './layout';

export function profilePublished(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));

  return {
    subject: 'Profile Approved — Pana MIA',
    html: emailLayout({
      title: 'Profile Approved',
      preheader: 'Your profile has been approved and is now live!',
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Your Profile is Live!</h2>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
          Hi ${name}! Great news — your profile has been approved and is now visible in the Pana MIA directory.
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          Welcome to the community!
        </p>`,
    }),
    text: [
      'Profile Approved — Pana MIA',
      '===========================',
      '',
      `Hi ${String(params.name || '')}!`,
      '',
      'Great news — your profile has been approved and is now visible in the Pana MIA directory.',
      '',
      'Welcome to the community!',
      '',
      '---',
      'Pana MIA · panamia.club · hola@panamia.club',
    ].join('\n'),
  };
}
