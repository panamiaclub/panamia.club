export interface ModuleDefinition {
  id: string;
  title: string;
  summary: string;
  items: string[];
  terms: string[];
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
    terms: [
      'Describe your work accurately and obtain permission before managing another person’s listing. Published fields and images can be visible to others; do not put secrets or sensitive private information in them. A listing may require human approval and may be limited to the supported South Florida communities.',
      'Approval is not an endorsement, license, background check, or guarantee of a business. Manage delegated access through the permissions the service provides. Profile records are eligible for deletion as described in the Privacy Policy, subject to the separate rules for published contributions and required records.',
    ],
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
    terms: [
      'Authors and accepted collaborators are responsible for rights, accuracy, attribution, and the publication license. Invitations and peer review do not authorize publishing another author’s private work outside the agreed workflow. A review or approval is not a warranty from Pana MIA Club. Wholly AI-generated publication is prohibited; disclose permitted AI assistance.',
      'Articles may be delivered through supported federation features. Before the three-month archive threshold, removal is available under the applicable workflow. Afterward, community-record retention and attribution removal apply as described in the Privacy Policy. Independently licensed or remote copies may remain.',
    ],
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
    terms: [
      'Visibility settings and content warnings help choose an audience but cannot prevent recipients from copying information they can access. Public or federated posts may reach independent servers and their users. Follow requests, blocking, muting, groups, and messaging follow the controls the service exposes. Do not evade those controls or contact someone who has asked you to stop.',
      'Social posts on our service are eligible for deletion at any age. We send supported deletion notices to known peers on a best-effort basis, not a guarantee of remote removal. The community and child-safety rules apply to posts, stories, profiles, and messages alike.',
    ],
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
      'No server-side recording',
      'All-party consent for recordings (Fla. Stat. \u00a7 934.03)',
      'Cancellation and no-show policy',
      'Free vs paid sessions and rate expectations',
    ],
    terms: [
      'Arrange a session with the participants’ consent and confirm its topic, timing, price if any, and cancellation arrangements before making a commitment. The platform does not certify a mentor’s qualifications or make a session a substitute for regulated professional advice.',
      'Be respectful and do not record audio, video, or screen content without all participants’ explicit consent. Available calls use peer-to-peer technology. Temporary chat, whiteboard, signaling, and retained session notes follow the Privacy Policy; a recording or transcript is not promised. Cancel or complete pending sessions before account deletion when the deletion workflow requires it.',
    ],
  },
  {
    id: 'events',
    title: 'Events',
    summary:
      'Event records become part of the community record after completion. Organizers are responsible for accurate event details and permissions. Attendance data is eligible for deletion. Recording must respect consent and applicable law.',
    items: [
      'Event creation and organizer responsibilities',
      'Venue submission and approval',
      'RSVP and attendee data visibility',
      'All-party consent for recordings (Fla. Stat. \u00a7 934.03)',
      'Age restrictions and photo policies',
      'Cancellation policy',
      'Organizer and volunteer roles',
    ],
    terms: [
      'Organizers must describe an event accurately, obtain needed venue permissions, state admission terms and age restrictions, and update material changes or cancellations. Check those details with the organizer before traveling or paying. An RSVP does not guarantee admission, availability, safety, or a refund.',
      'Attendance information is visible as described by the event feature. Do not photograph or record people in violation of their consent or applicable law. Completed event records can become community record; personal attendance records remain subject to the deletion rules. These terms do not promise event photo uploads, livestreaming, or another feature that is not enabled.',
    ],
  },
  {
    id: 'uploads',
    title: 'Uploads',
    summary:
      'Published uploads must use a supported Creative Commons instrument (CC BY, CC BY-SA, or CC0). Uploads are stored on Cloudflare R2 and normally follow the retention class of their parent content. Pornography, sexually explicit material, gratuitous graphic violence, illegal material, and infringement are prohibited.',
    items: [
      'Supported formats (JPEG, PNG, WebP, GIF)',
      'CC license required on all uploads',
      'Cloudflare R2 storage',
      'Content moderation and removal',
      'DMCA takedown process',
      'NCMEC/CyberTipline reporting obligation',
      'Prohibited content (CSAM, copyright infringement, etc.)',
    ],
    terms: [
      'Only upload files you are authorized to provide and license. A publication license does not cure copyright infringement, a privacy violation, or abuse. Do not upload malware, pornography, sexually explicit content, content intended to be sexually gratifying, non-consensual intimate imagery, gratuitous graphic real-world violence, or child sexual abuse material.',
      'Lawful nonsexual nudity may be permitted only in a clearly justified educational, documentary, scientific, or artistic context and must not be gratuitous. This exception never permits child sexual abuse or exploitation, non-consensual intimate imagery, or other illegal content.',
      'Graphic real-world violence is permitted only in non-gratuitous newsworthy coverage.',
      'File types and limits depend on the feature and may change for safety or operational reasons. Media is hosted through our infrastructure providers and normally follows its parent content’s retention. Moderation, legally required retention, brief caching, and independent remote copies can affect removal. Report prohibited material without downloading or redistributing it.',
    ],
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
    terms: [
      'Review the amount, currency, goods or service, recurrence, shipping, and any cancellation or refund terms displayed at checkout before authorizing payment. Stripe processes supported donations, memberships, and merchandise transactions; applicable provider terms and non-waivable consumer rights also apply.',
      'A recurring contribution or membership continues according to the terms you accept until cancelled through the provided account or support controls. Account deletion does not erase required financial records or an already incurred obligation. Contact support about payment or fulfillment problems. A donation does not buy digital privileges unless expressly described; these terms introduce no new paid feature and do not promise that every contribution is tax-deductible.',
    ],
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
    terms: [
      'Keep your Nostr secret key private and backed up. Keys created or imported on your device are not recoverable by the operator if you lose them. Bringing an existing public key can allow others to connect your identities across relays. Key rotation does not automatically transfer every prior relationship or remote copy.',
      'Group membership controls relay access, not end-to-end confidentiality: participants and the relay can see messages, and a recipient can retain a copy. Respect invitations, membership rules, and restricted communications. Leaving can be subject to the stated grace period. Published signed events cannot be guaranteed to disappear from other relays; deletion notices are advisory. Abuse reports are safety records and may outlive account deletion.',
    ],
  },
  {
    id: 'community',
    title: 'Community',
    summary:
      'Moderators may warn, restrict, suspend, or terminate access according to severity and safety needs. Serious risks can require immediate action. Appeals may be sent to the published contact. Repeat infringement can lead to termination.',
    items: [
      'Code of conduct',
      'Behavioral expectations',
      'Enforcement process (warning, suspension, termination)',
      'Appeals mechanism',
      'Repeat infringer policy (DMCA)',
      'Admin moderation powers and transparency',
    ],
    terms: [
      'Apply the acceptable-use and child-safety rules in profiles, posts, messages, groups, and events. Moderators may warn, remove content, restrict features, suspend, or terminate access according to severity, available evidence, and safety needs. A warning is not required before acting on a serious risk.',
      'Do not retaliate against a good-faith reporter or try to erase moderation records. Send an appeal to hola@panamia.club with enough context to identify the decision, without passwords or illegal material. Appeals do not promise a particular outcome, disclosure of someone else’s private report, or restoration of content that cannot lawfully be hosted. Repeat infringement can lead to termination under the copyright policy.',
    ],
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
      {module.terms.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </>
  );
}
