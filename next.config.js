/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The feed's browser sanitizer uses PostCSS. Keep it out of vinext's
  // server-only external list so its CommonJS dependencies are prebundled.
  transpilePackages: ['postcss'],

  // The auth instance serves the apex, www, and the Pana subdomain surfaces.
  // In dev, vinext rejects cross-origin requests before better-auth can apply
  // its own trustedOrigins list unless the host is repeated here. Production
  // is unaffected; this only lets the Playwright dev server exercise the same
  // origins the deployed Worker accepts.
  allowedDevOrigins: [
    'panamia.club',
    'www.panamia.club',
    '*.panamia.club',
    'pana.social',
    '*.pana.social',
  ],

  async redirects() {
    return [
      {
        source: '/newsletter-sign-up-702983',
        destination: '/info#newsletter-signup',
        permanent: true,
      },
    ];
  },

  // trailingSlash is off: it 308'd inbox POSTs, and remote servers don't follow
  // redirects on POST, so federation deliveries failed silently. The auth
  // conflict it also caused is handled by advanced.skipTrailingSlashes in auth.ts.
  // ActivityPub URLs are published without the trailing slash to match
  // (see lib/federation/index.ts).
};

export default nextConfig;
