import { emailLayout, escape } from './layout';

export function listingSetup(params: Record<string, unknown>) {
  const name = String(params.businessName || 'your business');
  const url = String(params.signInUrl || '');
  const setupUrl = typeof params.setupUrl === 'string' ? params.setupUrl : null;
  return {
    subject: `Confirm and manage ${name.replace(/[\r\n]/g, ' ').slice(0, 100)} on Pana`,
    html: emailLayout({
      title: 'Finish your business setup',
      preheader: `Confirm and manage ${name} on Pana.`,
      body: `
        <h2 style="margin:0 0 20px;color:#111827;font-size:22px;">Finish setting up ${escape(name)}</h2>
        <p style="color:#374151;line-height:1.6;">Your listing has been submitted for staff review. Use this secure link to sign in or create your account, then confirm that you want to manage this business.</p>
        <p style="margin:24px 0;"><a href="${escape(url)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#f28444;color:#111827;text-decoration:none;font-weight:700;">Confirm and manage ${escape(name)}</a></p>
        <p style="color:#6b7280;line-height:1.6;">Opening the link does not assign ownership. You will confirm on the setup page. Staff approval is separate, and you can finish setup later.</p>
        <p style="color:#6b7280;line-height:1.6;">If you did not request this listing, ignore this email. The sign-in link expires shortly; you can sign in again to finish setup.</p>
        ${setupUrl ? `<p style="color:#6b7280;line-height:1.6;">Link expired? <a href="${escape(setupUrl)}">Continue business setup</a> and sign in with this email address.</p>` : ''}`,
    }),
    text: [
      `Finish setting up ${name} on Pana`,
      '',
      'Your listing has been submitted for staff review.',
      'Sign in or create your account, then confirm that you want to manage this business:',
      url,
      '',
      'Opening the link does not assign ownership. You will confirm on the setup page.',
      'Staff approval is separate, and you can finish setup later.',
      'If you did not request this listing, ignore this email.',
      ...(setupUrl
        ? [
            '',
            `Link expired? Continue setup and sign in with this email address: ${setupUrl}`,
          ]
        : []),
    ].join('\n'),
  };
}
