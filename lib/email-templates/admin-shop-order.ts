import { button, emailLayout, escape } from './layout';

export function adminShopOrder(params: Record<string, unknown>) {
  const orderId = String(params.orderId ?? '');
  const email = String(params.email ?? '');
  const kind = String(params.kind ?? 'merchandise');
  const totalCents = Number(params.totalCents ?? 0);
  const siteUrl = String(params.siteUrl ?? 'https://panamia.club');
  const subject = `New ${kind === 'subscription' ? 'subscription' : 'shop order'} ${orderId}`;
  const html = emailLayout({
    title: subject,
    preheader: `${email} paid $${(totalCents / 100).toFixed(2)}`,
    body: `
      <h2 style="margin:0 0 16px;color:#111827;">${escape(subject)}</h2>
      <p style="color:#374151;line-height:1.6;">
        ${escape(email)} paid $${(totalCents / 100).toFixed(2)}.
      </p>
      ${button('Open orders', `${siteUrl}/admin/shop`)}
    `,
  });
  const text = `${subject}\n${email} paid $${(totalCents / 100).toFixed(2)}.\n${siteUrl}/admin/shop`;
  return { subject, html, text };
}
