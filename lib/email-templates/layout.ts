const BRAND_COLOR = '#4ab3ea';
const BUTTON_BG = '#ec4899';

interface EmailLayoutOptions {
  title: string;
  preheader: string;
  body: string;
  variant?: 'listing';
}

export const listingEmailStyles = {
  heading:
    'margin:0 0 24px;color:#110d0d;font-size:32px;line-height:1.2;font-weight:700;',
  paragraph: 'margin:0 0 16px;color:#110d0d;font-size:16px;line-height:1.65;',
  note: 'margin:0 0 16px;color:#110d0d;font-size:14px;line-height:1.65;',
  link: 'color:#303e8c;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word;',
};

// `body` is raw HTML by contract — every template builds it and is responsible
// for escaping what it interpolates. `title` and `preheader` are NOT: they are
// plain text, and several templates build the preheader from user-supplied
// names. Escaping them here rather than at each call site is what keeps that
// from being a per-template decision that one template gets wrong. Callers must
// therefore pass these two UNESCAPED, or they double-encode.
export function emailLayout(opts: EmailLayoutOptions): string {
  if (opts.variant === 'listing') return listingLayout(opts);
  const title = escape(opts.title);
  const preheader = escape(opts.preheader);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 3px solid ${BRAND_COLOR};">
              <h1 style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">Pana MIA</h1>
              <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">South Florida's Creative Community</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Pana MIA &middot; <a href="https://panamia.club" style="color: #9ca3af; text-decoration: underline;">panamia.club</a> &middot; <a href="mailto:hola@panamia.club" style="color: #9ca3af; text-decoration: underline;">hola@panamia.club</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function listingLayout(opts: EmailLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escape(opts.title)}</title>
  <style>
    @media screen and (max-width:600px) {
      .listing-shell { padding:16px 12px !important; }
      .listing-padding { padding-left:24px !important; padding-right:24px !important; }
      .listing-heading { font-size:28px !important; }
    }
  </style>
</head>
<body bgcolor="#fff7ec" style="margin:0;padding:0;background-color:#fff7ec;color:#110d0d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(opts.preheader)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="#fff7ec" style="width:100%;background-color:#fff7ec;">
    <tr>
      <td class="listing-shell" align="center" style="padding:32px 12px;">
        <!--[if mso]><table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td><![endif]-->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="#fff7ec" style="width:100%;max-width:600px;background-color:#fff7ec;border:1px solid #dfd3c2;border-radius:24px;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td height="8" bgcolor="#f28444" style="height:8px;font-size:1px;line-height:8px;background-color:#f28444;border-radius:24px 24px 0 0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="listing-padding" style="padding:32px 36px 20px;">
              <img src="https://panamia.club/logos/pana_logo_long_orange.png" alt="PanaMia" width="190" height="32" referrerpolicy="no-referrer" style="display:block;width:190px;max-width:100%;height:auto;border:0;color:#110d0d;font-size:24px;font-weight:700;">
              <p style="margin:18px 0 0;color:#110d0d;font-size:14px;line-height:1.6;">South Florida, a little more connected.</p>
            </td>
          </tr>
          <tr>
            <td class="listing-padding" style="padding:12px 36px 32px;overflow-wrap:anywhere;word-break:break-word;">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td class="listing-padding" bgcolor="#fbf7d2" style="padding:24px 36px;background-color:#fbf7d2;border-top:1px solid #dfd3c2;border-radius:0 0 24px 24px;">
              <p style="margin:0 0 8px;color:#110d0d;font-size:14px;line-height:1.6;">PanaMia &middot; South Florida's local community</p>
              <p style="margin:0;color:#110d0d;font-size:14px;line-height:1.6;">
                <a href="https://panamia.club" rel="noreferrer" referrerpolicy="no-referrer" style="${listingEmailStyles.link}">panamia.club</a> &middot; <a href="mailto:hola@panamia.club" style="${listingEmailStyles.link}">hola@panamia.club</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function button(text: string, url: string, variant?: 'listing'): string {
  if (variant === 'listing') {
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
  <tr>
    <td align="left" style="padding:8px 0 16px;">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:100%;">
        <tr>
          <td align="center" bgcolor="#303e8c" style="background-color:#303e8c;border-radius:999px;mso-padding-alt:16px 24px;">
            <a href="${escape(url)}" rel="noreferrer" referrerpolicy="no-referrer" style="display:inline-block;background-color:#303e8c;color:#fff7ec;text-decoration:none;padding:16px 24px;border:1px solid #303e8c;border-radius:999px;font-size:16px;line-height:1.5;font-weight:700;">${escape(text)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding: 20px 0;">
      <a href="${url}" style="display: inline-block; background-color: ${BUTTON_BG}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

// Escape user-supplied text for interpolation into email HTML.
//
// `&` must be replaced FIRST or it would double-encode the entities added
// below. Escaping `<`/`>` alone is enough to stop tag injection in a text node,
// which is where every current caller puts its output — but quotes are escaped
// too so that the next caller to interpolate into an attribute (href, title,
// alt) doesn't silently get an injection. Entities decode back to the literal
// characters in both contexts, so nothing is mangled for the reader.
export function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
