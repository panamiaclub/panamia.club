function Placeholder({ label }: { label: string }) {
  return (
    <p className="rounded border border-dashed border-blue-400/50 bg-blue-50/50 p-4 text-sm text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
      {label} — full legal text to be drafted.
    </p>
  );
}

export interface ModuleDefinition {
  id: string;
  title: string;
  summary: string;
  items: string[];
  placeholder: string;
}

export const moduleDefinitions: ModuleDefinition[] = [
  {
    id: 'profiles',
    title: 'Profiles',
    summary:
      'Your profile is publicly listed in the community directory. You choose what information to share. Profile data is fully deletable on request. All profile images must be CC-licensed.',
    items: [
      'Directory listing and public visibility',
      'Social gating (eligibility requirements)',
      'Profile verification process',
      'Linked profiles',
      'Membership levels',
      'Image upload requirements and CC licensing',
    ],
    placeholder: 'Profiles module terms',
  },
  {
    id: 'articles',
    title: 'Articles',
    summary:
      'Articles are published under Creative Commons and may be federated via ActivityPub. After 3 months, articles become part of the community record and can be anonymized but not fully deleted. AI-generated content is prohibited; AI-assisted tools require disclosure.',
    items: [
      'Publishing workflow (draft, review, published)',
      'Co-authoring: invitation, acceptance, shared editing',
      'Peer review process and reviewer conduct',
      'CC license selection (per article)',
      'Removal policy',
      'ActivityPub federation of articles',
      'Reply threading',
    ],
    placeholder: 'Articles module terms',
  },
  {
    id: 'social',
    title: 'Social',
    summary:
      'Social posts are federated via ActivityPub to Mastodon and other servers. Unlike articles, social posts are always fully deletable regardless of age. Federated copies on remote servers may persist after deletion (best-effort Delete activity sent).',
    items: [
      'ActivityPub federation: content may leave Pana MIA Club servers',
      'Peer Networking Data: federated content subject to remote server policies',
      'Social eligibility gating',
      'Follow requests and approval',
      'Content warnings and visibility controls',
      'Hashtags, mentions, and discoverability',
      'Interaction with external Mastodon users',
      'CC license on all posts',
    ],
    placeholder: 'Social module terms',
  },
  {
    id: 'mentoring',
    title: 'Mentoring',
    summary:
      'Mentoring sessions use peer-to-peer video/audio (WebRTC). Session data (whiteboard, chat) is temporary and automatically purged. Session notes are persistent and deletable. Florida law requires all-party consent before any recording.',
    items: [
      'Session booking and scheduling',
      'Conduct expectations (mentor and mentee)',
      'Video/audio: WebRTC peer-to-peer (Peer Networking Data)',
      'Whiteboard: collaborative Temporary Data (purged after session)',
      'Chat: Temporary Data',
      'Session notes: Persistent Data',
      'No server-side recording unless explicitly enabled with consent',
      'All-party consent for recordings (Fla. Stat. \u00a7 934.03)',
      'Cancellation and no-show policy',
      'Free vs paid sessions and rate expectations',
    ],
    placeholder: 'Mentoring module terms',
  },
  {
    id: 'events',
    title: 'Events',
    summary:
      'Event records become part of the community record after completion. Event photos are CC-licensed and archived 3 months post-event. Recording at events requires all-party consent per Florida law. RSVP data is fully deletable.',
    items: [
      'Event creation and organizer responsibilities',
      'Venue submission and approval',
      'RSVP and attendee data visibility',
      'Photo uploads and approval workflow (CC-licensed)',
      'Livestreaming: Cloudflare Stream, SRT keys as Temporary Data',
      'All-party consent for recordings (Fla. Stat. \u00a7 934.03)',
      'Age restrictions and photo policies',
      'Cancellation policy',
      'Organizer and volunteer roles',
    ],
    placeholder: 'Events module terms',
  },
  {
    id: 'uploads',
    title: 'Uploads',
    summary:
      'All uploaded media must be Creative Commons licensed (CC BY or CC BY-SA). No "all rights reserved" content. Uploads are stored on Cloudflare R2 and follow the retention class of their parent content. DMCA takedown process available.',
    items: [
      'Supported formats (JPEG, PNG, WebP, GIF)',
      'CC license required on all uploads',
      'Cloudflare R2 storage',
      'Content moderation and removal',
      'DMCA takedown process',
      'NCMEC/CyberTipline reporting obligation',
      'Prohibited content (CSAM, copyright infringement, etc.)',
    ],
    placeholder: 'Uploads module terms',
  },
  {
    id: 'payments',
    title: 'Payments',
    summary:
      'Donations, memberships, and merchandise payments are processed through Stripe. Buyer contact details may be synchronized to GoHighLevel for customer communication. Stripe retains transaction records for 7+ years per tax and legal requirements, even after account deletion.',
    items: [
      'Stripe for donations, memberships, and merchandise',
      'GoHighLevel may receive buyer contact and subscription tags',
      'Donation tiers and membership levels',
      'Recurring subscription management',
      'Refund policy',
      'Tax receipts and record retention (7 years)',
    ],
    placeholder: 'Payments module terms',
  },
  {
    id: 'resilience',
    title: 'Resilience Network',
    summary:
      'The Resilience Network is a community Nostr relay. Your secret key is generated in your browser and never sent to us — if you lose it, we cannot recover it. Your public key and group membership are deleted with your account, but anything you publish to Nostr is signed, permanent, and hosted by relays we do not operate: we can remove it from our relay, but no one can remove it from Nostr at large. Group chat is access-controlled, not end-to-end encrypted.',
    items: [
      'Key custody: secret keys are generated client-side and never transmitted',
      'Bring-your-own keys: proof of control, and the cross-relay correlation disclosure',
      'One Nostr identity per profile; key rotation and what it does not carry over',
      'Group membership records and the NIP-05 handle at pana.social',
      'Member-created groups: who may invite, and who may edit a group’s details',
      'Invitations name both members and are deleted once answered or after 30 days',
      'Leaving takes effect after a grace period; a group ends when its last member leaves',
      'Group chat is read-gated at the relay, not end-to-end encrypted',
      'Confidentiality: not republishing other members’ group messages',
      'Abuse reports (NIP-56) are retained after account deletion',
      'Published Nostr events cannot be retracted (NIP-09 deletes are advisory)',
    ],
    placeholder: 'Resilience Network module terms',
  },
  {
    id: 'community',
    title: 'Community',
    summary:
      'Community conduct is enforced through a graduated process: warning, suspension, then termination. Appeals are available at each stage. Repeat copyright infringers are subject to account termination per DMCA policy.',
    items: [
      'Code of conduct',
      'Behavioral expectations',
      'Enforcement process (warning, suspension, termination)',
      'Appeals mechanism',
      'Repeat infringer policy (DMCA)',
      'Admin moderation powers and transparency',
    ],
    placeholder: 'Community module terms',
  },
];

export function ModuleContent({ module }: { module: ModuleDefinition }) {
  return (
    <>
      {/* Plain-language summary */}
      <div className="bg-muted/30 not-prose mb-4 rounded-lg border p-4 text-sm">
        <p className="mb-1 font-medium">Summary</p>
        <p className="text-muted-foreground">{module.summary}</p>
      </div>

      <p>This module covers:</p>
      <ul>
        {module.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Placeholder label={module.placeholder} />
    </>
  );
}
