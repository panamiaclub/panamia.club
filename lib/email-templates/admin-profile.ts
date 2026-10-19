import { emailLayout, button, escape } from './layout';

export function adminProfile(params: Record<string, unknown>) {
  const name = escape(String(params.name || ''));
  const email = escape(String(params.email || ''));
  const details = escape(String(params.details || ''));
  const phone = escape(String(params.phone_number || ''));
  const fiveWords = escape(String(params.five_words || ''));
  const tags = escape(String(params.tags || ''));
  const hearaboutus = escape(String(params.hearaboutus || ''));
  const affiliate = escape(String(params.affiliate || 'n/a'));
  const approveUrl = String(params.approve_url || '');
  const declineUrl = String(params.decline_url || '');

  const socialFields = [
    ['Website', params.socials_website],
    ['Instagram', params.socials_instagram],
    ['Facebook', params.socials_facebook],
    ['TikTok', params.socials_tiktok],
    ['Twitter/X', params.socials_twitter],
    ['Spotify', params.socials_spotify],
  ]
    .filter(([, v]) => v && v !== 'n/a')
    .map(
      ([label, v]) =>
        `<tr><td style="padding: 4px 0; color: #6b7280; font-size: 14px; width: 120px; vertical-align: top;">${label}</td><td style="padding: 4px 0; color: #374151; font-size: 14px;">${escape(String(v))}</td></tr>`
    )
    .join('');

  return {
    subject: `[Admin] Profile Submission: ${String(params.name || 'Unknown')}`,
    html: emailLayout({
      title: 'Profile Submission',
      preheader: `New profile submission from ${String(params.name || '')}`,
      body: `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">New Profile Submission</h2>
        <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px; vertical-align: top;">Name</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${name}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Email</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${email}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Phone</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${phone}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Details</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${details}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Five Words</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${fiveWords}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Tags</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${tags}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Heard About</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${hearaboutus}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Affiliate</td><td style="padding: 8px 0; color: #374151; font-size: 14px;">${affiliate}</td></tr>
          ${socialFields}
        </table>
        ${button('Approve', approveUrl)}
        <div style="text-align: center; margin-top: 8px;">
          <a href="${declineUrl}" style="color: #6b7280; font-size: 14px; text-decoration: underline;">Decline</a>
        </div>`,
    }),
    text: [
      '[Admin] Profile Submission',
      '=========================',
      '',
      `Name: ${String(params.name || '')}`,
      `Email: ${String(params.email || '')}`,
      `Phone: ${String(params.phone_number || '')}`,
      `Details: ${String(params.details || '')}`,
      `Five Words: ${String(params.five_words || '')}`,
      `Tags: ${String(params.tags || '')}`,
      `Heard About: ${String(params.hearaboutus || '')}`,
      `Affiliate: ${String(params.affiliate || 'n/a')}`,
      '',
      `Approve: ${approveUrl}`,
      `Decline: ${declineUrl}`,
      '',
      '---',
      'Pana MIA · panamia.club',
    ].join('\n'),
  };
}
