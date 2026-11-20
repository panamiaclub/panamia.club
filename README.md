# Pana Mia Club

**The Future is Local**

A community platform connecting South Florida artists, creatives, and local businesses.

[![License](https://img.shields.io/badge/license-see%20LICENSE-green)](./LICENSE)

---

<p align="center">
  <img src="docs/pana-auric-field.png" alt="The Pana MIA Auric Field — layered architecture diagram" width="640" />
</p>

---

## What is Pana Mia?

Pana Mia Club is a 501(c)(3) non-profit building tools to support regenerative, vibrant local economies in South Florida. We believe the future is local—and we're creating the digital infrastructure to make that future possible.

**Pana** (noun): A close friend, someone you trust.

---

## What We Offer

### Community Directory

Discover local artists, musicians, restaurants, venues, and creative businesses. Browse by category, neighborhood, or keyword.

### Events

Find local shows, markets, gallery openings, and community gatherings. Stay connected to what's happening in your neighborhood.

### Social Timeline

A multimedia microblogging platform built into the community. Share posts with markdown formatting, images, GIFs, and video. Follow other community members, like and reply to posts. Built on [ActivityPub](https://www.w3.org/TR/activitypub/) for future federation with Mastodon, Pixelfed, and other fediverse servers.

_Features: Markdown editor, media attachments, post visibility controls, content-sensitivity labels_

### Community Articles

Share your voice with the community. Write about local culture, neighborhood guides, business spotlights, or creative projects. Collaborate with co-authors and get feedback through peer review before publishing.

_Features: Co-authorship, peer review, RSS feeds_

### Peer Mentoring

Connect one-on-one with community members for mentoring sessions. Whether you're seeking guidance on starting a business, navigating the local scene, or staying centered—find someone who's been there.

_Features: Video calls, scheduling, session notes_

### Support Local

Every profile represents a real person or business in our community. When you discover someone through Pana Mia, you're supporting the local economy.

---

## Our Values

- **Community First**: Built by and for South Florida's creative community
- **Privacy Focused**: No ads, no selling your data
- **Accessible**: Free to use, designed for everyone
- **Source Reviewable**: Our code is publicly available for transparency and collaboration

---

## Get Involved

### Join the Community

Visit [pana.social](https://pana.social) to create your profile and start connecting.

### Support Us

We're a non-profit and rely on community support. [Make a donation](https://pana.social/support-pana) to help keep the platform running.

### Contribute

We welcome developers, designers, writers, and community organizers. See our [Contributing Guide](./docs/CONTRIBUTING.md) to get started.

---

## For Developers

Want to run the platform locally or contribute code?

**[Quick Start Guide](./docs/QUICK-START.md)** — Get the development environment running

### Technical Overview

- **Runtime**: [Vinext](https://github.com/nicholasgasior/vinext) — React 19 server components on Vite
- **Database**: PostgreSQL via Supabase, accessed through Cloudflare Hyperdrive (Drizzle ORM)
- **Authentication**: Passwordless (magic links + OAuth via better-auth)
- **Hosting**: Cloudflare Workers

See [FEATURES.md](./docs/FEATURES.md) for a complete feature overview.

---

## Google Ad Grants readiness

Apply with the organization's live website, **https://panamia.club**, not a
design mock, social feed, or donation-provider URL. A `.club` domain is
allowed; Google requires administrative control of the domain, not `.org`.
Google makes the eligibility and website approval decisions.

The website provides original mission and program content, a public EIN
disclosure, an HTML impact report, contact and volunteer information, and a
secure donation entry point. Production homepage stories load from the
published-articles API; sample stories belong only in design previews.
Program links must not point into `/mock`. Mock pages carry `noindex`.
The shop explains that proceeds support nonprofit programs and distinguishes
purchases from donations. The Worker redirects HTTP requests for the configured
production root domain and its subdomains to HTTPS, preserving paths and query
parameters; local HTTP previews are unchanged.

The [financial transparency section](https://panamia.club/about-us#transparency)
links Pana's public IRS-derived filing history and labels the limitations of
Form 990-N. Its dated disclosure is a filing category, not an audited statement
of exact income or expenses. Review it when the next filing becomes public.

Before submitting an activation request:

- Deploy these changes and recheck the public homepage, About, Programs,
  Impact, Contact, volunteer and donation pages on desktop and mobile.
- Confirm current IRS 501(c)(3) status, the published EIN and legal entity,
  domain administrative control, and Google for Nonprofits approval through
  Goodstack. Repository copy is not proof of current eligibility.
- Confirm the published impact figures and shop-proceeds disclosure with
  the organization. Publish only approved, accurate reports and contact details.
  Publish current financial information explaining how commercial proceeds
  support the mission; event attendance figures are not a financial report.
- Verify HTTP redirects to HTTPS, no mixed content or broken links, and mobile
  loading speed using [PageSpeed Insights](https://pagespeed.web.dev/).
- Complete a controlled donation checkout and receipt check with the payment
  owner. A working landing page alone does not verify payment completion.
- In Google for Nonprofits, select Ad Grants, enter the owned website, watch
  the welcome video, and submit activation. **Do not create a separate Google
  Ads account during activation**; Google provides the account.

Before running grant campaigns, configure and verify meaningful conversion
tracking for completed donations or successfully accepted volunteer/contact
forms. Do not count a donate-button click, a failed submission, a homepage
visit, or an unverified thank-you URL as a completed donation. Google tracking
is not installed by these website changes; choose its scope and update privacy
disclosures and consent handling before enabling it. Keep authenticated social
and mentoring activity outside advertising measurement.

Use South Florida geo-targeting for local services, at least two unique
sitelink assets, and the required conversion-based bidding. Maintain the
required monthly conversion activity and 5% account-level CTR (except
Smart-only accounts), and respond to required program surveys.

Official references:
[website policy](https://support.google.com/nonprofits/answer/1657899),
[eligibility](https://support.google.com/nonprofits/answer/3215869),
[activation](https://support.google.com/nonprofits/topic/16219045),
[account management](https://support.google.com/nonprofits/answer/117827),
and [conversion tracking](https://support.google.com/nonprofits/answer/9841491).

---

## Documentation

| Document                                       | Description                             |
| ---------------------------------------------- | --------------------------------------- |
| [Quick Start](./docs/QUICK-START.md)           | Developer setup guide                   |
| [Android](./docs/ANDROID.md)                   | Phone testing and Google Play releases  |
| [iOS](./docs/IOS.md)                           | iPhone/iPad testing and App Store releases |
| [Features](./docs/FEATURES.md)                 | Platform feature overview               |
| [Database Design](./docs/DATABASE-DESIGN.md)   | Schema, migrations, connection setup    |
| [Articles Roadmap](./docs/ARTICLE-ROADMAP.md)  | Community articles implementation plan  |
| [Social Roadmap](./docs/SOCIAL-ROADMAP.md)     | Social timeline & federation plan       |
| [Groups Roadmap](./docs/GROUPS-ROADMAP.md)     | Interest groups, feed & events design   |
| [Chat Roadmap](./docs/CHAT-ROADMAP.md)         | Real-time messaging design & roadmap    |
| [Mentoring Guide](./docs/MENTORING-ROADMAP.md) | Peer mentoring guide & roadmap          |
| [Search Roadmap](./docs/SEARCH-ROADMAP.md)     | Directory search design & roadmap       |
| [Hosting Costs](./docs/HOSTING-COSTS.md)       | What it costs to run, and how it scales |
| [Contributing](./docs/CONTRIBUTING.md)         | How to contribute                       |
| [Security](./docs/SECURITY_AUDIT.md)           | Security architecture                   |

---

## Contact

- **Website**: [pana.social](https://pana.social)
- **Contact Form**: [pana.social/form/contact-us](https://pana.social/form/contact-us/)
- **GitHub Issues**: [Report bugs or suggest features](https://github.com/unitedcolorsofg/panamia-next/issues)
- **Donations**: [Support Us](https://pana.social/support-pana)

For security concerns, use the contact form with subject "SECURITY VULNERABILITY".

---

## License

See [LICENSE](./LICENSE) file for details.

---

_Built in South Florida_
