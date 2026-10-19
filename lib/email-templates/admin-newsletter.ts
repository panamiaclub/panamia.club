import { emailLayout, escape } from './layout';

export function adminNewsletter(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));
  const email = escape(String(params.email || ''));
  const signupType = escape(String(params.signup_type || ''));

  return {
    subject: `[Admin] Newsletter Signup: ${String(params.name || 'Unknown')}`,
    html: emailLayout({
      title: 'Newsletter Signup',
      preheader: `New newsletter signup: ${String(params.name || '')}`,
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">New Newsletter Signup</h2>
        <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px; vertical-align: top;">Name</td>
            <td style="padding: 8px 0; color: #374151; font-size: 14px;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Email</td>
            <td style="padding: 8px 0; color: #374151; font-size: 14px;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Signup Type</td>
            <td style="padding: 8px 0; color: #374151; font-size: 14px;">${signupType}</td>
          </tr>
        </table>`,
    }),
    text: [
      '[Admin] Newsletter Signup',
      '========================',
      '',
      `Name: ${String(params.name || '')}`,
      `Email: ${String(params.email || '')}`,
      `Signup Type: ${String(params.signup_type || '')}`,
      '',
      '---',
      'Pana MIA · panamia.club',
    ].join('\n'),
  };
}
