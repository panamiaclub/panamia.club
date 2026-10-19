const BRAND_COLOR = '#4ab3ea';
const BUTTON_BG = '#ec4899';

// `body` is raw HTML by contract — every template builds it and is responsible
// for escaping what it interpolates. `title` and `preheader` are NOT: they are
// plain text, and several templates build the preheader from user-supplied
// names. Escaping them here rather than at each call site is what keeps that
// from being a per-template decision that one template gets wrong. Callers must
// therefore pass these two UNESCAPED, or they double-encode.
export function emailLayout(opts: {
  title: string;
  preheader: string;
  body: string;
}): string {
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

export function button(text: string, url: string): string {
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
