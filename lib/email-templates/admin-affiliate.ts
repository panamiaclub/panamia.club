import { emailLayout, escape } from './layout';

export function adminAffiliate(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));
  const email = escape(String(params.email || ''));
  const affiliate = escape(String(params.affiliate || 'n/a'));

  return {
    subject: `[Admin] Affiliate TOS Accepted: ${String(params.name || 'Unknown')}`,
    html: emailLayout({
      title: 'Affiliate TOS Accepted',
      preheader: `${String(params.name || '')} accepted the affiliate TOS`,
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Affiliate TOS Accepted</h2>
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
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Affiliate Code</td>
            <td style="padding: 8px 0; color: #374151; font-size: 14px;">${affiliate}</td>
          </tr>
        </table>`,
    }),
    text: [
      '[Admin] Affiliate TOS Accepted',
      '==============================',
      '',
      `Name: ${String(params.name || '')}`,
      `Email: ${String(params.email || '')}`,
      `Affiliate Code: ${String(params.affiliate || 'n/a')}`,
      '',
      '---',
      'Pana MIA · panamia.club',
    ].join('\n'),
  };
}
