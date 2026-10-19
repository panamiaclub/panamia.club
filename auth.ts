import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, genericOAuth, customSession } from 'better-auth/plugins';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import {
  users,
  sessions,
  accounts,
  verification,
  profiles,
} from '@/lib/schema';
import { and, count, eq, isNull } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { GhlClient } from '@/lib/ghl';
import {
  addProfileOwner,
  notBusinessListing,
} from '@/lib/server/profile-owners';
import { describeDbError } from '@/lib/server/db-error';
import { isAdminEmail } from '@/lib/server/admin-emails';
import { SURFACES, originFor, originForFrom } from '@/lib/panaverse/surfaces';
import { envConfig } from '@/lib/env.config';

// Custom email templates for magic link authentication
function html(params: { url: string; host: string; email: string }) {
  const { url, host, email } = params;
  const escapedEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedHost = host.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const brandColor = '#4ab3ea';
  const buttonBg = '#ec4899';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Pana MIA</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <!-- Preheader: visible in inbox preview, hidden in body -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your sign-in link for Pana MIA &mdash; expires in 24 hours.</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <h1 style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">Pana MIA</h1>
              <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">South Florida's Creative Community</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Sign in to your account</h2>

              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Hi there! We received a sign-in request for your account on <strong>${escapedHost}</strong>. Click the button below to sign in.
              </p>

              <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">
                This is a one-time link — it can only be used once and will expire automatically after <strong>24 hours</strong>. If you need a new link after it expires, you can request one at any time from the sign-in page.
              </p>

              <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                For your security, do not forward this email to anyone. Pana MIA staff will never ask you for this link.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${url}" style="display: inline-block; background-color: ${buttonBg}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                      Sign in to Pana MIA
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 8px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin: 0; color: ${brandColor}; font-size: 13px; word-break: break-all; line-height: 1.6;">
                ${url}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This email was sent to <strong>${escapedEmail}</strong> because a sign-in was requested for this address.
              </p>
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">
                If you did not request this, you can safely ignore this email. The link will expire on its own and your account will not be affected.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Pana MIA &middot; <a href="https://panamia.club" style="color: #9ca3af; text-decoration: underline;">panamia.club</a> &middot; <a href="mailto:hola@pana.social" style="color: #9ca3af; text-decoration: underline;">hola@pana.social</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function text(params: { url: string; host: string }) {
  const { url, host } = params;
  return [
    'Sign in to Pana MIA',
    '====================',
    '',
    'Hi there!',
    '',
    `We received a sign-in request for your account on ${host}, South Florida's Creative Community.`,
    '',
    'Use the link below to sign in (or copy and paste it into your browser):',
    '',
    url,
    '',
    'This link expires in 24 hours and works only once. After it expires you can request a new link from the sign-in page.',
    '',
    'For your security, do not forward this email to anyone. Pana MIA staff will never ask you for this link.',
    '',
    "Didn't request this? You can safely ignore this email. Your account has not been accessed and no changes were made.",
    '',
    '---',
    "Pana MIA \u00b7 South Florida's Creative Community",
    'pana.social \u00b7 hola@pana.social',
  ].join('\n');
}

// Email template for email migration verification (sent to new email)
export function emailMigrationVerificationHtml(params: {
  url: string;
  oldEmail: string;
  newEmail: string;
}) {
  const { url, oldEmail, newEmail } = params;
  const escapedOldEmail = oldEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedNewEmail = newEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const brandColor = '#4ab3ea';
  const buttonBg = '#ec4899';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email change &mdash; Pana MIA</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <!-- Preheader: visible in inbox preview, hidden in body -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Confirm your Pana MIA email address change &mdash; link expires in 5 minutes.</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <h1 style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">Pana MIA</h1>
              <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">South Florida's Creative Community</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Verify Your Email Address Change</h2>

              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                You recently requested to change the email address on your Pana MIA account.
              </p>

              <p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
                Current address: <strong>${escapedOldEmail}</strong><br>
                New address: <strong>${escapedNewEmail}</strong>
              </p>

              <div style="margin: 0 0 30px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: 600;">Before you confirm, please note:</p>
                <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 14px; line-height: 1.8;">
                  <li>This confirmation link expires in <strong>5 minutes</strong></li>
                  <li>You will be signed out of all active sessions</li>
                  <li>A notification will be sent to your current address (${escapedOldEmail})</li>
                </ul>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${url}" style="display: inline-block; background-color: ${buttonBg}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                      Confirm Email Change
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 8px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin: 0; color: ${brandColor}; font-size: 13px; word-break: break-all; line-height: 1.6;">
                ${url}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">
                If you did not request this email change, please ignore this message. Your account will not be affected. If you believe someone else is attempting to access your account, contact us at <a href="mailto:hola@pana.social" style="color: #9ca3af;">hola@pana.social</a>.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Pana MIA &middot; <a href="https://panamia.club" style="color: #9ca3af; text-decoration: underline;">panamia.club</a> &middot; <a href="mailto:hola@pana.social" style="color: #9ca3af; text-decoration: underline;">hola@pana.social</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export function emailMigrationVerificationText(params: {
  url: string;
  oldEmail: string;
  newEmail: string;
}) {
  const { url, oldEmail, newEmail } = params;
  return [
    'Verify Your Email Address Change \u2014 Pana MIA',
    '==============================================',
    '',
    'You recently requested to change the email address on your Pana MIA account.',
    '',
    `  Current address: ${oldEmail}`,
    `  New address:     ${newEmail}`,
    '',
    'To confirm this change, open the link below in your browser:',
    '',
    url,
    '',
    'Before you confirm, please note:',
    '  - This link expires in 5 minutes',
    '  - You will be signed out of all active sessions',
    `  - A notification will be sent to your current address (${oldEmail})`,
    '',
    'If you did not request this change, ignore this email. Your account will not be affected.',
    'If you believe someone else is attempting to access your account, contact us at hola@pana.social.',
    '',
    '---',
    "Pana MIA \u00b7 South Florida's Creative Community",
    'pana.social \u00b7 hola@pana.social',
  ].join('\n');
}

// Email template for migration confirmation (sent to old email)
export function emailMigrationConfirmationHtml(params: {
  oldEmail: string;
  newEmail: string;
  timestamp: string;
}) {
  const { oldEmail, newEmail, timestamp } = params;
  const escapedOldEmail = oldEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedNewEmail = newEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const brandColor = '#4ab3ea';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Pana MIA account email was changed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <!-- Preheader: visible in inbox preview, hidden in body -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Security notice: the email address on your Pana MIA account was changed on ${timestamp}.</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <h1 style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">Pana MIA</h1>
              <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">South Florida's Creative Community</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Your Account Email Was Changed</h2>

              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                This is a security notification from Pana MIA. The email address on your account was successfully changed on <strong>${timestamp}</strong>.
              </p>

              <div style="margin: 0 0 24px 0; padding: 20px; background-color: #eff6ff; border-left: 4px solid ${brandColor}; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px;"><strong>Previous email:</strong> ${escapedOldEmail}</p>
                <p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>New email:</strong> ${escapedNewEmail}</p>
              </div>

              <p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
                If you made this change, no further action is needed. You have been signed out of all active sessions — sign in using your new email address to continue using Pana MIA.
              </p>

              <div style="margin: 0 0 20px 0; padding: 20px; background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #991b1b; font-size: 14px; font-weight: 600;">Did not authorize this change?</p>
                <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                  Contact us immediately at <a href="mailto:hola@pana.social" style="color: #dc2626; text-decoration: underline;">hola@pana.social</a>. Please include the date and time shown above so we can investigate promptly.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">
                This automated security notification was sent to ${escapedOldEmail} because it was the address on your account at the time of the change.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Pana MIA &middot; <a href="https://panamia.club" style="color: #9ca3af; text-decoration: underline;">panamia.club</a> &middot; <a href="mailto:hola@pana.social" style="color: #9ca3af; text-decoration: underline;">hola@pana.social</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export function emailMigrationConfirmationText(params: {
  oldEmail: string;
  newEmail: string;
  timestamp: string;
}) {
  const { oldEmail, newEmail, timestamp } = params;
  return [
    'Your Pana MIA Account Email Was Changed',
    '========================================',
    '',
    `This is a security notification. The email address on your Pana MIA account was changed on ${timestamp}.`,
    '',
    `  Previous email: ${oldEmail}`,
    `  New email:      ${newEmail}`,
    '',
    'If you authorized this change, no further action is needed. You have been signed out of all active sessions. Sign in using your new email address to continue using Pana MIA.',
    '',
    'Did not authorize this change?',
    'Contact us immediately at hola@pana.social. Please include the date and time shown above so we can investigate promptly.',
    '',
    '---',
    "Pana MIA \u00b7 South Florida's Creative Community",
    'pana.social \u00b7 hola@pana.social',
  ].join('\n');
}

// Email template for OAuth email verification (sent to OAuth-provided email)
export function oauthVerificationHtml(params: {
  url: string;
  email: string;
  provider: string;
}) {
  const { url, email, provider } = params;
  const escapedEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

  const brandColor = '#4ab3ea';
  const buttonBg = '#ec4899';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email &mdash; Pana MIA</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <!-- Preheader: visible in inbox preview, hidden in body -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Confirm your email address to complete sign-in to Pana MIA via ${providerName} &mdash; expires in 5 minutes.</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <h1 style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">Pana MIA</h1>
              <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">South Florida's Creative Community</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 600;">Verify your email address</h2>

              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                You recently signed in to Pana MIA using <strong>${providerName}</strong>. To complete your sign-in and confirm that you own this email address, click the button below.
              </p>

              <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">
                We send this verification step the first time you sign in via a new provider to make sure the email address belongs to you.
              </p>

              <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                This verification link expires in <strong>5 minutes</strong>. If it expires, return to Pana MIA and sign in again to receive a fresh link.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${url}" style="display: inline-block; background-color: ${buttonBg}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                      Verify Email &amp; Complete Sign-In
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 8px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin: 0; color: ${brandColor}; font-size: 13px; word-break: break-all; line-height: 1.6;">
                ${url}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This email was sent to <strong>${escapedEmail}</strong> because it is the address associated with your ${providerName} account.
              </p>
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">
                If you did not attempt to sign in using ${providerName}, you can safely ignore this email. The link will expire on its own.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Pana MIA &middot; <a href="https://panamia.club" style="color: #9ca3af; text-decoration: underline;">panamia.club</a> &middot; <a href="mailto:hola@pana.social" style="color: #9ca3af; text-decoration: underline;">hola@pana.social</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export function oauthVerificationText(params: {
  url: string;
  email: string;
  provider: string;
}) {
  const { url, email, provider } = params;
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

  return [
    'Verify Your Email Address \u2014 Pana MIA',
    '=========================================',
    '',
    `Hi ${email},`,
    '',
    `You recently signed in to Pana MIA using ${providerName}. To complete your sign-in and confirm that you own this email address, open the link below:`,
    '',
    url,
    '',
    `We send this verification step the first time you sign in via a new provider. It expires in 5 minutes. If it expires, return to Pana MIA and sign in again to receive a fresh link.`,
    '',
    `If you did not attempt to sign in using ${providerName}, you can safely ignore this email. Your account has not been accessed.`,
    '',
    '---',
    "Pana MIA \u00b7 South Florida's Creative Community",
    'pana.social \u00b7 hola@pana.social',
  ].join('\n');
}

// =============================================================================
// AppSession type — shared shape for server-side session access
// =============================================================================

export type AppSession = {
  user: {
    id: string;
    email: string;
    emailVerified: Date | null;
    name?: string | null;
    image?: string | null;

    // Admin role. True for ADMIN_EMAILS members and for anyone granted
    // profiles.roles.admin through /admin/users/live.
    isAdmin: boolean;

    // The founder tier: ADMIN_EMAILS membership alone, never the column.
    // Gates who may grant admin to somebody else — see checkSuperAdminAuth().
    // Every super admin is also an admin; the reverse does not hold.
    isSuperAdmin: boolean;

    // Verification badges (from profile)
    panaVerified: boolean;
    legalAgeVerified: boolean;

    // Scoped roles (from profile)
    isMentoringModerator: boolean;
    isEventOrganizer: boolean;
    isContentModerator: boolean;
  };
  expires: string;
};

// =============================================================================
// Provider verification configuration
// =============================================================================

type ProviderTrustLevel = 'trusted' | 'verification-required' | 'disabled';

const TRUST_LEVELS: readonly ProviderTrustLevel[] = [
  'trusted',
  'verification-required',
  'disabled',
];

/**
 * Resolve one OAUTH_* trust-level variable.
 *
 * Falls back to the `defaultValue` declared for that key in lib/env.config.ts.
 * Those defaults used to be documentation only — nothing read them at runtime —
 * so an operator who set GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_ENABLED but
 * not OAUTH_GOOGLE got 'verification-required', which the account hook below
 * turns into a flat refusal (the verification flow it names is still a TODO).
 * The result was a Google button that always failed with a generic auth error,
 * while env.config.ts advertised the default as 'trusted'.
 *
 * An unrecognised value is rejected rather than cast. The old blind cast failed
 * open: `OAUTH_GOOGLE=Trusted` matched neither 'disabled' nor
 * 'verification-required', so every check below waved it through — a typo
 * quietly bought the provider more trust than it was meant to have.
 */
function readTrustLevel(envKey: string): ProviderTrustLevel | undefined {
  const raw = process.env[envKey]?.trim();
  const value = raw || envConfig[envKey]?.defaultValue;
  if (!value) return undefined;

  if (!TRUST_LEVELS.includes(value as ProviderTrustLevel)) {
    console.error(
      `Invalid ${envKey}="${value}" — expected one of ${TRUST_LEVELS.join(', ')}. Treating the provider as disabled.`
    );
    return 'disabled';
  }
  return value as ProviderTrustLevel;
}

function getProviderVerificationConfig(
  provider?: string
): 'trusted' | 'verification-required' | 'disabled' {
  if (!provider) return 'disabled';

  // Magic link provider is always trusted (we send the link)
  if (provider === 'credential' || provider === 'magic-link') return 'trusted';

  // Check for instance-specific mastodon config
  if (provider === 'mastodon') {
    const instance = process.env.MASTODON_INSTANCE || 'https://mastodon.social';
    const hostname = new URL(instance).hostname;
    if (hostname === 'mastodon.social') {
      const config = readTrustLevel('OAUTH_MASTODON_SOCIAL');
      if (config) return config;
    }
    const genericConfig = readTrustLevel('OAUTH_MASTODON');
    if (genericConfig) return genericConfig;
  }

  const config = readTrustLevel(`OAUTH_${provider.toUpperCase()}`);
  if (config) return config;

  return 'verification-required';
}

// =============================================================================
// better-auth instance — lazy singleton
// =============================================================================
//
// betterAuth is initialized on the first request, not at module-load time.
// The `db` proxy from @/lib/db is passed to drizzleAdapter — every property access
// on the proxy calls getDb() which returns the current request's hyperdriveInstance,
// so better-auth queries always use the fresh per-request client.

interface ProfileVerification {
  panaVerified?: boolean;
  legalAgeVerified?: boolean;
}
interface ProfileRoles {
  mentoringModerator?: boolean;
  eventOrganizer?: boolean;
  contentModerator?: boolean;
  // Granted from /admin/users/live by a super admin. Deliberately on the same
  // JSONB column as the scoped roles rather than a new `users` column: the
  // identity profile is 1:1 with the user (profiles.userId is UNIQUE) and
  // cascades on account delete, so a grant cannot outlive the account it was
  // made to. See drizzle/0021_drop_users_role.sql for why users.role is gone.
  admin?: boolean;
}

type EnrichedUserFields = {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  panaVerified: boolean;
  legalAgeVerified: boolean;
  isMentoringModerator: boolean;
  isEventOrganizer: boolean;
  isContentModerator: boolean;
};

async function enrichUserFields(
  userId: string,
  email: string | null | undefined
): Promise<EnrichedUserFields> {
  // The founder tier. This is the only input that does not depend on the
  // database, which is exactly what makes it the break-glass path: it still
  // resolves when the `profiles` read below throws, and it cannot be revoked
  // through any screen in the product. The last admin can therefore never be
  // locked out by a bad write.
  const isSuperAdmin = isAdminEmail(email);

  let profileVerification: ProfileVerification | null = null;
  let profileRoles: ProfileRoles | null = null;
  try {
    // Only verification/roles are read below — scope the select so a full-row
    // read (~50 cols) can't fail on an unrelated column and the query stays cheap.
    const userProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
      columns: { verification: true, roles: true },
    });
    if (userProfile) {
      profileVerification =
        userProfile.verification as ProfileVerification | null;
      profileRoles = userProfile.roles as ProfileRoles | null;
    }
  } catch (error) {
    // Drizzle wraps the driver error as "Failed query: <sql>" and puts the real
    // postgres error (missing column, connection/statement timeout, etc.) on
    // `.cause` — log it explicitly so the failure isn't opaque.
    const cause = (error as { cause?: unknown }).cause;
    console.error('Error fetching profile for session enrichment:', {
      message: error instanceof Error ? error.message : String(error),
      cause,
      code: (cause as { code?: string })?.code,
    });
  }

  return {
    // The union of the two tiers. Note the ordering consequence of the catch
    // above: if the profile read fails, profileRoles stays null and this
    // degrades to env-only admin. A database problem can cost a granted admin
    // their access until it recovers, but it can never hand access to someone
    // who had none — the safe direction for a failure in a privilege check.
    isAdmin: isSuperAdmin || profileRoles?.admin === true,
    isSuperAdmin,
    panaVerified: profileVerification?.panaVerified || false,
    legalAgeVerified: profileVerification?.legalAgeVerified || false,
    isMentoringModerator: profileRoles?.mentoringModerator || false,
    isEventOrganizer: profileRoles?.eventOrganizer || false,
    isContentModerator: profileRoles?.contentModerator || false,
  };
}

/**
 * Read the enriched fields off a session the `customSession` plugin has already
 * decorated.
 *
 * That plugin (see the plugin list below) runs inside `api.getSession()`, so by
 * the time a session reaches `auth()` the `profiles` read has already happened.
 * `auth()` used to call `enrichUserFields` again on the result, issuing a
 * second, byte-identical query on every authenticated request — multiplied
 * across ~170 `auth()` call sites, and multiplied again on the routes that call
 * `auth()` more than once.
 *
 * Returns null when the fields are absent, so the caller falls back to a live
 * read. That fallback is the old behaviour exactly; it just no longer runs on
 * the happy path. Keeping it means reordering or dropping the plugin degrades
 * to an extra query rather than to a member silently losing their roles.
 *
 * `isAdmin` is the probe because `enrichUserFields` always sets it to a boolean,
 * including when the profile lookup throws — so its presence proves enrichment
 * ran, while a badge-only probe could not tell "not enriched" from "not verified".
 */
function readEnrichedFields(user: unknown): EnrichedUserFields | null {
  const enriched = user as Partial<EnrichedUserFields> | null | undefined;
  if (!enriched || typeof enriched.isAdmin !== 'boolean') return null;
  return {
    isAdmin: enriched.isAdmin,
    // Defaults to false rather than to isAdmin. A session decorated by an
    // older build carries isAdmin but not this field, and the two possible
    // wrong answers are not symmetric: defaulting to false costs a founder
    // the grant button for one request, while defaulting to isAdmin would
    // hand the grant button to every column-granted admin.
    isSuperAdmin: enriched.isSuperAdmin ?? false,
    panaVerified: enriched.panaVerified ?? false,
    legalAgeVerified: enriched.legalAgeVerified ?? false,
    isMentoringModerator: enriched.isMentoringModerator ?? false,
    isEventOrganizer: enriched.isEventOrganizer ?? false,
    isContentModerator: enriched.isContentModerator ?? false,
  };
}

/**
 * Attach an unclaimed directory listing to the account that just signed in, and
 * link its GoHighLevel contact.
 *
 * A profile is created unclaimed whenever the listing predates the account —
 * legacy rows imported from MongoDB, or a listing added on someone's behalf.
 * The only join key is the email address.
 *
 * Called from two hooks, because neither covers every sign-in on its own:
 *   - account.create.after — OAuth, which is the only flow that writes an
 *     `account` row.
 *   - session.create.after — everything, including magic links. better-auth's
 *     magic-link flow goes findUserByEmail -> createUser -> createSession and
 *     never touches `account`, so an account-only hook silently skips the
 *     passwordless majority and leaves their listing orphaned.
 *
 * Idempotent and cheap to repeat: once claimed, the `userId IS NULL` filter
 * stops matching, so a returning user costs one indexed lookup per sign-in.
 * See `alwaysLinkGhl` for why the GHL call is kept off that hot path.
 *
 * Best-effort throughout — a failure here must never block a sign-in.
 */
/**
 * Give a member the social actor their account already entitles them to.
 *
 * profiles.socialEligible defaults to true (lib/schema/index.ts), but nothing
 * ever created the actor to go with it, so a new member reached /s and was
 * asked to "Enable Social Features" — an opt-in to something the account had
 * already granted. Actor creation is the missing half of that default, not a
 * new permission being taken.
 *
 * The consent reasoning recorded for business listings (f137f94, "claiming is
 * the consent signal") is deliberately not extended here: claiming a listing
 * is a real consent moment for a business you own, whereas a person signing up
 * for a Pana account has no equivalent second step to hang it on.
 *
 * Runs on every sign-in rather than only on account creation so it also
 * back-fills members who signed up before this existed; createActorForProfile
 * returns the existing actor untouched once there is one. Best-effort and
 * never fatal — a member who cannot federate must still be able to sign in.
 * Imported lazily to keep keypair generation out of the auth entry bundle.
 */
async function ensureSocialActor(
  userId: string,
  source: string
): Promise<void> {
  try {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
      columns: { id: true },
    });
    if (!profile) return;

    const { createActorForProfile } =
      await import('@/lib/federation/wrappers/actor');
    const result = await createActorForProfile(profile.id);
    if (!result.success) {
      console.log('[auth] social actor not created', {
        userId,
        source,
        reason: result.error,
      });
    }
  } catch (error) {
    console.error('Error creating social actor (non-fatal):', error);
  }
}

async function claimProfileForUser(
  userId: string,
  /** Where the claim was triggered from; for logs only. */
  source: string,
  /**
   * Attempt the GHL lookup even when nothing was claimed.
   *
   * The lookup is gated on a missing ghlContactId, which never gets filled if
   * GHL simply has no contact for that address — so an ungated retry would hit
   * the API on every single sign-in. Account creation is rare enough to always
   * try; the per-session path only tries when it just claimed a profile, or on
   * the user's first-ever session (see the session-count check below).
   */
  alwaysLinkGhl: boolean
): Promise<void> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    });
    if (!user?.email) return;
    const email = user.email.toLowerCase();

    const unclaimedProfile = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.email, email),
        isNull(profiles.userId),
        // Directory listings from /form/get-listed (still marked
        // `business_intake` in status.source) are deliberately excluded:
        // attaching one here would make this human *be* the listing and
        // consume their single profiles.userId slot. They are
        // claimed explicitly instead, which grants ownership without
        // overwriting identity. See lib/server/profile-owners.ts.
        notBusinessListing
      ),
    });

    if (unclaimedProfile) {
      console.log('Auto-claiming profile for user:', email, 'via:', source);
      // Strip any admin flag the unclaimed row carries — see the matching
      // comment in lib/server/profile.ts. Claiming is proof of an email
      // address; it must not also be a way to inherit admin out of seeded or
      // imported data that never passed the grant route's founder gate.
      const existingRoles = unclaimedProfile.roles as Record<
        string,
        unknown
      > | null;
      const safeRoles =
        existingRoles && 'admin' in existingRoles
          ? { ...existingRoles, admin: false }
          : existingRoles;
      await db
        .update(profiles)
        .set({ userId, roles: safeRoles })
        .where(eq(profiles.id, unclaimedProfile.id));
      // Keep the ownership table in step with the identity link so permission
      // checks have one consistent answer.
      await addProfileOwner(unclaimedProfile.id, userId);
      console.log('Profile claimed successfully');
    }

    // Before the GHL early-return below, which exits for returning users: a
    // member who signed up prior to this needs the back-fill on a later
    // sign-in, not only on the one where something was claimed.
    await ensureSocialActor(userId, source);

    // Nothing claimed and not an account-creation path — normally a returning
    // user, so stop before the GHL call. The exception is a backfilled
    // placeholder (scripts/backfill-unclaimed-users.ts), whose profile arrives
    // pre-linked: the claim above finds nothing on the owner's very first
    // sign-in, which would otherwise skip their GHL link forever. A first-ever
    // session is that moment, and only that moment, so the hot path for
    // returning users is untouched.
    if (!unclaimedProfile && !alwaysLinkGhl) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(sessions)
        .where(eq(sessions.userId, userId));
      // The session that triggered this hook is already written, so a genuine
      // first sign-in reads as exactly one.
      if (Number(total) > 1) return;
    }

    // GHL signup claim — link GHL contact ID at registration (Phase 3).
    // Best-effort: never blocks the sign-in.
    try {
      // Resolve which profile to link (the just-claimed one, or an
      // already-claimed profile for users signing in via a new provider).
      const profileToLink =
        unclaimedProfile ??
        (await db.query.profiles.findFirst({
          where: eq(profiles.userId, userId),
          columns: { id: true, ghlContactId: true, ghlOptedOut: true },
        }));

      if (
        profileToLink &&
        !profileToLink.ghlContactId &&
        !profileToLink.ghlOptedOut
      ) {
        const ghl = GhlClient.create();
        if (ghl) {
          // Bracketing breadcrumbs. lib/ghl.ts now aborts at GHL_TIMEOUT_MS,
          // so a stalled upstream reaches the catch below as a
          // GhlTimeoutError instead of hanging the request forever; these
          // still bracket the call so a slow-but-alive GHL is visible in the
          // logs as the gap between "start" and "done".
          console.log('[auth] GHL lookup start', { userId, source });
          const contact = await ghl.findByEmail(email);
          console.log('[auth] GHL lookup done', {
            userId,
            found: Boolean(contact?.id),
          });
          if (contact?.id) {
            await db
              .update(profiles)
              .set({ ghlContactId: contact.id })
              .where(eq(profiles.id, profileToLink.id));
            console.log('GHL contact linked:', contact.id);
          }
        }
      }
    } catch (ghlError) {
      console.error('Error linking GHL contact (non-fatal):', ghlError);
    }
  } catch (error) {
    console.error('Error auto-claiming profile:', error);
  }
}

type BetterAuthInstance = ReturnType<typeof betterAuth>;
export type BetterAuthServer = BetterAuthInstance;
let _betterAuthInstance: BetterAuthInstance | null = null;

function getBetterAuth(): BetterAuthInstance {
  if (_betterAuthInstance) return _betterAuthInstance;

  // Panaverse surfaces (panamia.club, social.panamia.club, …) are subdomains of
  // one registrable domain, so one session can cover all of them. Opt-in: with
  // the var unset the cookie stays host-only, exactly as every existing session
  // was issued. Setting it re-scopes cookies, which signs current users out once.
  //
  // This cannot reach the fediverse identity domain — a different registrable
  // domain needs a real OAuth handoff, not a shared cookie.
  const panaverseCookieDomain = process.env.PANAVERSE_COOKIE_DOMAIN?.trim();

  const authBaseURL =
    process.env.NEXT_PUBLIC_HOST_URL ||
    process.env.BETTER_AUTH_URL ||
    'http://localhost:3000';

  // Parsed defensively: this runs at instance construction, so a malformed
  // value here would take down every auth route rather than one callback.
  const authBaseHost = (() => {
    try {
      return new URL(authBaseURL).host;
    } catch {
      return null;
    }
  })();

  _betterAuthInstance = betterAuth<BetterAuthOptions>({
    database: drizzleAdapter(db, {
      provider: 'pg',
      // Singular keys required: usePlural:false means the adapter looks up models by singular
      // name (e.g. "session", "user") — matching better-auth's internal model names exactly.
      // Our Drizzle export names are plural (users, sessions, …) so we alias them here.
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification, // Drizzle export is already singular
      },
      // usePlural:false so getModelName("user") === "user" (not "users").
      // This makes experimental.joins work: the adapter builds `with: { user: true }`
      // which matches our sessionsRelations / accountsRelations relation key.
      usePlural: false,
    }),
    advanced: {
      // vinext #2158: vinext 0.1.1+ may hand the [...all] catch-all handler a path
      // with a trailing slash; better-auth rejects it under default trailing-slash
      // validation, 404ing every auth endpoint. Skipping that validation is the
      // maintainer-suggested workaround.
      skipTrailingSlashes: true,
      database: {
        // Use Drizzle's relational API (single JOIN query) for session lookups.
        // Without this, the adapter falls back to two separate queries (sessions
        // SELECT + users SELECT via handleFallbackJoin) which hangs in CF Workers
        // with max:1. Was `experimental: { joins: true }` before better-auth 1.7.
        joins: true,
      },
      ...(panaverseCookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: panaverseCookieDomain,
            },
          }
        : {}),
    },
    session: {
      // 90 days, not better-auth's 7-day default.
      //
      // Session length is the dominant cost lever on this deployment, because
      // production has no OAuth providers enabled — the magic link is the only
      // way back in, so an expired session is an email. docs/SMS-LOGIN-ROADMAP.md
      // models the same effect for SMS and puts the 7-day window at ~600k
      // re-authentications/yr at 200k members, against ~160k at 90 days.
      //
      // On a community platform people check in every few weeks, so a 7-day
      // window meant re-authenticating on nearly every visit. The tradeoff is
      // that a stolen cookie stays useful for longer — accepted here because
      // this cookie is already the durable credential, and the alternative
      // mails people sign-in links constantly, which is both the expensive
      // option and the one that trains the reflex phishing depends on.
      expiresIn: 60 * 60 * 24 * 90,
      // Sliding refresh, at most once a day. Matches better-auth's default;
      // pinned so the window above cannot be silently halved by a default change.
      updateAge: 60 * 60 * 24,
      cookieCache: {
        // Serve the session from a signed cookie instead of reading the
        // sessions table on every request. This removes the session⋈user query
        // from every authenticated request; `customSession` still runs after
        // it, so the `profiles` read remains (see readEnrichedFields above for
        // why it is now one query per request rather than two).
        //
        // 5 minutes bounds how long a *revoked* session keeps working. It does
        // not make roles or verification badges stale: those come from
        // `customSession`, which runs on every call regardless of whether the
        // session itself was served from cache. Anything needing instant
        // revocation should read the database directly rather than shortening
        // this.
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    rateLimit: {
      // `enabled` is deliberately unset: better-auth turns rate limiting on in
      // production and off in development, which is what we want on both sides.
      //
      // Storage is the in-memory default. In Workers that is per-isolate rather
      // than global, so this throttles a persistent attacker without being a
      // hard guarantee. It is still worth having — it costs nothing, needs no
      // binding, and no table (a database-backed limiter would add writes to
      // the very budget this change is trimming). If abuse ever shows up in
      // practice, the durable fix is a Cloudflare rate-limiting rule in front
      // of /api/auth, not a different better-auth storage backend.
      window: 60,
      max: 30,
      customRules: {
        // This endpoint mails on demand, so leaving it on the general limit is
        // both a cost leak and a way to use us to flood a third party's inbox.
        // Three attempts per quarter-hour is ample for a real person who
        // mistyped their address once.
        '/sign-in/magic-link': { window: 60 * 15, max: 3 },
      },
      // Note this covers better-auth's own endpoints only. The app's own
      // mail-sending routes (e.g. /api/user/request-email-migration) sit
      // outside this and are still unthrottled.
    },
    secret: process.env.BETTER_AUTH_SECRET,
    // BETTER_AUTH_URL is CF-RUNTIME only and gets baked in as undefined by Vite.
    // NEXT_PUBLIC_HOST_URL is in CF-BUILD and is correctly baked in at build time.
    baseURL: authBaseURL,
    trustedOrigins: [
      process.env.NEXT_PUBLIC_HOST_URL,
      process.env.BETTER_AUTH_URL,
      // Every surface signs in against this one auth instance, so each surface
      // origin has to be trusted or its sign-in requests get rejected.
      ...SURFACES.map((surface) => originFor(surface)),
      // Those name the configured root domain, so away from production they all
      // point at pana.social and no local surface is trusted. Deriving them from
      // the host actually being served covers dev, where a callback to
      // http://social.localhost:3003 is otherwise rejected with a bare 403.
      // In production this resolves to the same origins as above.
      ...SURFACES.map((surface) => originForFrom(surface, authBaseHost)),
      'http://localhost:3000',
      'http://localhost:3001',
    ].filter(Boolean) as string[],
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // Sign-in only. `calendar.events` used to be requested here for a
        // mentoring-calendar sync that was never built, and nothing reads the
        // stored token except the revoke-on-delete path in lib/oauth-revoke.ts.
        // It is one of Google's restricted scopes, so asking for it put the app
        // through a verification review — and made a member granting calendar
        // access the price of signing in. Re-add it alongside the feature that
        // needs it, not before.
        scope: ['openid', 'email', 'profile'],
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID!,
        clientSecret: process.env.APPLE_CLIENT_SECRET!,
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const { host } = new URL(url);
          await sendEmail(
            email,
            'Sign in to Pana MIA',
            html({ url, host, email }),
            text({ url, host })
          );
        },
      }),
      customSession(async ({ user, session }) => {
        const extras = await enrichUserFields(user.id, user.email);
        return { user: { ...user, ...extras }, session };
      }),
      genericOAuth({
        config: [
          // Wikimedia — emails are optional and may not be verified
          {
            providerId: 'wikimedia',
            clientId: process.env.WIKIMEDIA_CLIENT_ID!,
            clientSecret: process.env.WIKIMEDIA_CLIENT_SECRET!,
            authorizationUrl:
              'https://meta.wikimedia.org/w/rest.php/oauth2/authorize',
            tokenUrl:
              'https://meta.wikimedia.org/w/rest.php/oauth2/access_token',
            userInfoUrl:
              'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile',
            scopes: ['identify', 'email'],
            // better-auth 1.7 moved provider identity out of mapProfileToUser
            // (OAuthMappedUser declares `id?: never`) and into accountSubject,
            // which feeds the account's (providerId, accountId) key. The
            // built-in default reads profile.id for non-OIDC providers;
            // Wikimedia's /resource/profile returns the stable id as `sub`.
            accountSubject: ({ profile }) => String(profile.sub ?? profile.id),
            mapProfileToUser: (profile: Record<string, unknown>) => ({
              email: (profile.email as string) || undefined,
              name:
                (profile.realname as string) || (profile.username as string),
              image: undefined,
            }),
          },
          // Mastodon — custom OAuth per-instance
          {
            providerId: 'mastodon',
            clientId: process.env.MASTODON_CLIENT_ID!,
            clientSecret: process.env.MASTODON_CLIENT_SECRET!,
            authorizationUrl: process.env.MASTODON_INSTANCE
              ? `${process.env.MASTODON_INSTANCE}/oauth/authorize`
              : 'https://mastodon.social/oauth/authorize',
            tokenUrl: process.env.MASTODON_INSTANCE
              ? `${process.env.MASTODON_INSTANCE}/oauth/token`
              : 'https://mastodon.social/oauth/token',
            userInfoUrl: process.env.MASTODON_INSTANCE
              ? `${process.env.MASTODON_INSTANCE}/api/v1/accounts/verify_credentials`
              : 'https://mastodon.social/api/v1/accounts/verify_credentials',
            scopes: ['read:accounts'],
            // verify_credentials returns the account id as `id`, which is also
            // better-auth 1.7's default subject for a non-OIDC provider; stated
            // explicitly so the account key does not depend on that default.
            accountSubject: ({ profile }) => String(profile.id),
            mapProfileToUser: (profile: Record<string, unknown>) => ({
              email: (profile.email as string) || undefined,
              name:
                (profile.display_name as string) ||
                (profile.username as string) ||
                undefined,
              image: (profile.avatar as string) || undefined,
            }),
          },
        ],
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.email) {
              console.error('Sign-in blocked: No email provided', {
                userId: user.id,
              });
              return false;
            }
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            const config = getProviderVerificationConfig(account.providerId);

            if (config === 'disabled') {
              console.log(
                'Sign-in blocked: Provider is disabled:',
                account.providerId
              );
              return false;
            }

            if (config === 'verification-required') {
              // TODO(QA): send verification email via oAuthVerifications + redirect
              // to /signin?verificationSent=true. Requires an HTTP-level hook to
              // intercept the OAuth callback and redirect. For now we block the
              // account creation — the user will see a generic auth error.
              console.log(
                'Sign-in blocked: Provider requires verification:',
                account.providerId
              );
              return false;
            }
          },
          after: async (account) => {
            // OAuth sign-in: claim as soon as the provider link is written, so
            // the listing is attached before the session is handed back.
            if (!account.userId) return;
            await claimProfileForUser(account.userId, account.providerId, true);
          },
        },
      },
      session: {
        create: {
          /**
           * Refuse a session for a locked account.
           *
           * This is the half of account locking that makes the column mean
           * something. `users.locked_at` had been in the schema since the
           * first migration, was read back by two endpoints as `locked`, and
           * was consulted by nothing — so an admin console that wrote it would
           * have produced a button reporting "Locked" over a member who was
           * still browsing.
           *
           * It hangs off session creation rather than the account hook for the
           * reason the `after` hook below already documents: this is the only
           * path every sign-in goes through. Hooking the providers instead
           * would leave magic links as an unlocked side door, which is the
           * door somebody looking for one would find.
           *
           * The other half is session revocation at lock time, in
           * lib/admin/users.ts — this stops the next sign-in, that ends the
           * one already open. Either alone leaves a usable account.
           *
           * Failing open on a database error is deliberate. The alternative is
           * that a blip in this query locks every member out of the site at
           * once, which is a far larger outage than the one locked account
           * getting an extra few minutes.
           */
          before: async (session) => {
            if (!session.userId) return;
            try {
              const [row] = await db
                .select({ lockedAt: users.lockedAt })
                .from(users)
                .where(eq(users.id, session.userId))
                .limit(1);
              if (row?.lockedAt) {
                console.warn('Sign-in blocked: account is locked', {
                  userId: session.userId,
                });
                return false;
              }
            } catch (error) {
              console.error('Lock check failed; allowing sign-in', error);
            }
          },
          after: async (session) => {
            // Every sign-in creates a session, so this is the path that covers
            // magic links — the account hook above never fires for them.
            if (!session.userId) return;
            await claimProfileForUser(session.userId, 'session', false);
          },
        },
      },
    },
  });

  return _betterAuthInstance;
}

// =============================================================================
// auth() compat shim — returns AppSession shape for server components
// =============================================================================

export async function auth(): Promise<AppSession | null> {
  try {
    const session = await getBetterAuth().api.getSession({
      headers: await headers(),
    });
    if (!session) return null;

    // Breadcrumb for narrowing a hang: a request that logs this and then
    // produces no response stalled after the session read, rather than inside
    // better-auth. Off by default — at scale this fired on every authenticated
    // request, and Workers Logs bills per event once past the included
    // allowance. Set DEBUG_REQUEST_LOG=1 to bring it back while investigating.
    if (process.env.DEBUG_REQUEST_LOG === '1') {
      console.log('[auth] session resolved', { userId: session.user.id });
    }

    const extras =
      readEnrichedFields(session.user) ??
      (await enrichUserFields(session.user.id, session.user.email));

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified ? new Date() : null,
        // Privacy: clear name and image (use profile data instead)
        name: '',
        image: '',
        ...extras,
      },
      expires: session.session.expiresAt.toISOString(),
    };
  } catch (error) {
    // Returning null here is indistinguishable from "not signed in", so an
    // auth-path failure used to present as a silent sign-out with nothing in
    // the logs. Callers still get null — the behavior is unchanged — but the
    // reason is now recoverable.
    console.error('[auth] session resolution failed', describeDbError(error));
    return null;
  }
}

export const handler = (request: Request) => getBetterAuth().handler(request);

/**
 * Resolve a session from headers supplied explicitly, rather than from the
 * ambient Next request context.
 *
 * `auth()` above reads `next/headers`, which only resolves inside a Next
 * server context. The Worker entry point runs *before* that context exists —
 * it is the raw `fetch(request, env)` handler — so a WebSocket upgrade there
 * cannot use it. This is the same `api.getSession` call with the headers
 * passed in by hand.
 *
 * Returns the user id alone, because the only caller needs an identity to look
 * an actor up with and nothing else. Narrow on purpose: exporting the
 * better-auth instance to reach one method would hand every future caller the
 * whole surface, including its mutating endpoints.
 *
 * ## Mobile
 *
 * Nothing here needs changing for the mobile app, because the mobile app is a
 * WebView on this same origin (see capacitor.config.ts) — it carries the same
 * cookie jar and the upgrade arrives exactly as a browser's does. The reason
 * this function exists is the Worker, not the client: the raw `fetch` entry
 * has no Next context to read from, whatever connected to it.
 *
 * A true native client would inherit it for free. Those are the mirror image
 * of a browser — no implicit cookie jar, but full control of the upgrade
 * request's headers — so one would set the session cookie itself and arrive
 * indistinguishable. Reading from a passed `Headers` rather than from ambient
 * context is what makes every case work; nothing here is browser-specific.
 */
export async function resolveUserIdFromHeaders(
  headers: Headers
): Promise<string | null> {
  try {
    const session = await getBetterAuth().api.getSession({ headers });
    return session?.user?.id ?? null;
  } catch (error) {
    console.error(
      '[auth] header session resolution failed',
      describeDbError(error)
    );
    return null;
  }
}

/**
 * The one magic-link endpoint we call from server code, narrowed to the shape
 * we use.
 *
 * `BetterAuthInstance` is `ReturnType<typeof betterAuth>` — the
 * unparameterized return type — so it carries none of the plugin endpoints
 * that the real instance has. Typing it properly means threading the whole
 * options object through the instance type, which also changes the exported
 * `BetterAuthServer` other modules depend on. Not worth that churn for one
 * call, so the assertion is confined here, next to the `magicLink()` entry in
 * the plugin list that justifies it.
 */
type MagicLinkApi = {
  signInMagicLink: (args: {
    body: { email: string; callbackURL?: string };
    headers: Headers;
  }) => Promise<unknown>;
};

/**
 * Mail a sign-in link to an address that may not have an account yet.
 *
 * better-auth's magic-link flow is findUserByEmail -> createUser ->
 * createSession, so for a new address this creates the account as a side
 * effect — which is exactly what lets the listing intake form turn an optional
 * personal email into a usable Pana account without ever asking anyone to
 * register first.
 *
 * Throws if the plugin is gone, rather than quietly resolving: a silent no-op
 * would look identical to a delivered email from the caller's side.
 */
export async function sendMagicLinkTo(
  email: string,
  requestHeaders: Headers,
  callbackURL?: string
): Promise<void> {
  const api = getBetterAuth().api as unknown as MagicLinkApi;
  if (typeof api.signInMagicLink !== 'function') {
    throw new Error('magicLink plugin is not configured');
  }
  await api.signInMagicLink({
    body: { email, callbackURL },
    headers: requestHeaders,
  });
}
