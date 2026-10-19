/**
 * Cloudflare Email Sending
 *
 * getEmail(env) must be called from worker/index.ts at the start of every request.
 * API routes and server components call sendEmail() / sendTemplateEmail() without
 * needing to pass env explicitly — same pattern as lib/db.ts / lib/r2.ts.
 *
 * - Production (CF Workers): env.EMAIL — native binding, no credentials needed
 * - Local dev: EMAIL_ENV !== 'PROD' → logs to console instead of sending
 *
 * Reference: https://blog.cloudflare.com/email-for-agents/
 * Docs: https://developers.cloudflare.com/email-service/
 */

import { renderTemplate, type TemplateId } from '@/lib/email-templates';

export interface SendEmail {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): Promise<void>;
}

export interface SendOptions {
  // Reply-To header. Used by staff notifications so that hitting reply reaches
  // the person who wrote in rather than the shared sending address.
  replyTo?: string;
}

export interface CloudflareEmailEnv {
  EMAIL?: SendEmail;
}

let cachedBinding: SendEmail | null = null;

export function getEmail(env?: CloudflareEmailEnv): SendEmail | null {
  if (env?.EMAIL) {
    cachedBinding = env.EMAIL;
  }
  return cachedBinding;
}

function getSenderAddress(): string {
  return process.env.EMAIL_SENDER_ADDRESS || 'hola@panamia.club';
}

function getSenderName(): string {
  return process.env.EMAIL_SENDER_NAME || 'Pana MIA';
}

function isDevMode(): boolean {
  return process.env.EMAIL_ENV !== 'PROD';
}

function formatFrom(): string {
  return `${getSenderName()} <${getSenderAddress()}>`;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  options?: SendOptions
): Promise<void> {
  if (isDevMode()) {
    console.log(
      '[email:dev] to=%s subject=%s replyTo=%s',
      to,
      subject,
      options?.replyTo ?? '—'
    );
    console.log(
      '[email:dev] html length=%d text length=%d',
      html.length,
      text?.length ?? 0
    );
    return;
  }

  const binding = getEmail();
  if (!binding) {
    console.error(
      '[email] binding not available — call getEmail(env) from worker entry'
    );
    return;
  }

  await binding.send({
    to,
    from: formatFrom(),
    subject,
    html,
    ...(text && { text }),
    ...(options?.replyTo && { replyTo: options.replyTo }),
  });
}

export async function sendTemplateEmail(
  templateId: TemplateId,
  params: Record<string, unknown>,
  toEmail?: string,
  options?: SendOptions
): Promise<void> {
  const defaultReceiver =
    process.env.DEV_RECEIVER_EMAIL || process.env.ADMIN_EMAILS?.split(',')[0];

  const to = toEmail || defaultReceiver;
  if (!to) {
    console.error(
      '[email] sendTemplateEmail: no recipient for template %s',
      templateId
    );
    return;
  }

  const { subject, html, text } = renderTemplate(templateId, params);
  await sendEmail(to, subject, html, text, options);
}
