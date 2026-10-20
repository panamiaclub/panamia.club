import { button, emailLayout, escape } from './layout';

function money(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function shopOrder(params: Record<string, unknown>) {
  const orderId = String(params.orderId ?? '');
  const customerName = String(params.customerName ?? 'Pana');
  const totalCents = Number(params.totalCents ?? 0);
  const currency = String(params.currency ?? 'usd');
  const kind = String(params.kind ?? 'merchandise');
  const siteUrl = String(params.siteUrl ?? 'https://panamia.club');
  const items = Array.isArray(params.items)
    ? (params.items as Array<{ name: string; quantity: number }>)
    : [];
  const itemList = items
    .map(
      (item) =>
        `<li>${escape(item.name)} &times; ${Math.max(1, item.quantity)}</li>`
    )
    .join('');
  const isSubscription = kind === 'subscription';

  const subject = isSubscription
    ? 'Your Pana MIA subscription is active'
    : 'We received your Pana MIA order';
  const html = emailLayout({
    title: subject,
    preheader: `${subject} — ${money(totalCents, currency)}`,
    body: `
      <h2 style="margin:0 0 16px;color:#111827;">Thank you, ${escape(customerName)}.</h2>
      <p style="color:#374151;line-height:1.6;">
        ${
          isSubscription
            ? 'Your subscription is active. Sign in with this email whenever you need to update your payment method or manage cancellation.'
            : 'Your order is paid and waiting for fulfillment. We will email you when it is on the way.'
        }
      </p>
      <ul style="color:#374151;line-height:1.8;">${itemList}</ul>
      <p style="font-size:18px;font-weight:700;color:#111827;">
        Total: ${money(totalCents, currency)}
      </p>
      <p style="color:#6b7280;font-size:13px;">Order ${escape(orderId)}</p>
      ${button(isSubscription ? 'Manage subscription' : 'Visit the shop', `${siteUrl}${isSubscription ? '/shop/account' : '/shop'}`)}
    `,
  });
  const text = `${subject}\n\n${items
    .map((item) => `${item.name} x ${Math.max(1, item.quantity)}`)
    .join('\n')}\n\nTotal: ${money(totalCents, currency)}\nOrder ${orderId}`;

  return { subject, html, text };
}
