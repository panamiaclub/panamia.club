type RobotsRule = {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
  crawlDelay?: number;
};

type RobotsResult = {
  rules: RobotsRule | RobotsRule[];
  sitemap?: string | string[];
  host?: string;
};

export default function robots(): RobotsResult {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/admin', '/api'],
    },
    sitemap: `${process.env.NEXT_PUBLIC_HOST_URL ?? 'https://panamia.club'}/sitemap.xml`,
  };
}
