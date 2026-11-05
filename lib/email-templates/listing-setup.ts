import { button, emailLayout, escape, listingEmailStyles } from './layout';

export function listingSetup(params: Record<string, unknown>) {
  const name = String(params.businessName || 'your business');
  const url = String(params.signInUrl || '');
  const setupUrl = typeof params.setupUrl === 'string' ? params.setupUrl : null;
  const instructions =
    'Your listing has been submitted for staff review. Use this secure link to sign in or create your account, then confirm that you want to manage this business.';
  const ownership =
    'Opening the link does not assign ownership. You will confirm on the setup page. Staff approval is separate, and you can finish setup later. To complete a listing review, every business needs a valid five-digit US ZIP, including online and mobile services. In Location, choose how people can find your business. A public visiting location needs a street address, city, state and ZIP. Online and mobile services need only a business base ZIP, not a street or home address.';
  const safety =
    'If you did not request this listing, ignore this email. The sign-in link expires shortly; you can sign in again to finish setup.';
  return {
    subject: `Confirm and manage ${name.replace(/[\r\n]/g, ' ').slice(0, 100)} on PanaMia`,
    html: emailLayout({
      variant: 'listing',
      title: 'Finish your business setup',
      preheader: `Confirm and manage ${name} on PanaMia.`,
      body: `
        <h1 class="listing-heading" style="${listingEmailStyles.heading}">Finish your business setup</h1>
        <p style="${listingEmailStyles.paragraph}">Hola ${escape(name)} team,</p>
        <p style="${listingEmailStyles.paragraph}">${escape(instructions)}</p>
        ${button('Confirm and manage my business', url, 'listing')}
        <p style="${listingEmailStyles.note}">${escape(ownership)}</p>
        <p style="${listingEmailStyles.note}">${escape(safety)}</p>
        ${setupUrl ? `<p style="${listingEmailStyles.note}">Link expired? <a href="${escape(setupUrl)}" rel="noreferrer" referrerpolicy="no-referrer" style="${listingEmailStyles.link}">Continue business setup</a> and sign in with this email address.</p>` : ''}`,
    }),
    text: [
      `Finish setting up ${name} on PanaMia`,
      '',
      instructions,
      'Confirm and manage my business:',
      url,
      '',
      ownership,
      safety,
      ...(setupUrl
        ? [
            '',
            `Link expired? Continue setup and sign in with this email address: ${setupUrl}`,
          ]
        : []),
      '',
      'PanaMia - panamia.club - hola@panamia.club',
    ].join('\n'),
  };
}
