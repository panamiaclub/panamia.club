import { emailLayout, escape } from './layout';

export function profilePublished(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));
  const profileUrl =
    typeof params.profileUrl === 'string' ? params.profileUrl : null;

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
        ${profileUrl ? `<p style="margin:24px 0;"><a href="${escape(profileUrl)}" style="font-weight:700;">View your business page</a></p>` : ''}
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
      ...(profileUrl ? ['', `View your business page: ${profileUrl}`] : []),
      '',
      'Welcome to the community!',
      '',
      '---',
      'Pana MIA · panamia.club · hola@panamia.club',
    ].join('\n'),
  };
}
