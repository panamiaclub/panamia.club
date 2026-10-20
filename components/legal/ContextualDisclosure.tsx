'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type LegalModule =
  | 'profiles'
  | 'articles'
  | 'social'
  | 'mentoring'
  | 'events'
  | 'uploads'
  | 'payments';

interface ModuleDisclosure {
  title: string;
  summary: string;
  highlights: string[];
  learnMoreHref: string;
}

const moduleDisclosures: Record<LegalModule, ModuleDisclosure> = {
  profiles: {
    title: 'Profile Terms',
    summary:
      'Your profile is publicly visible in the community directory. Information you add (name, bio, images, social links) can be seen by anyone, including via ActivityPub federation.',
    highlights: [
      'Profile data is deletable on request',
      'Images must be CC BY or CC BY-SA licensed',
      'You control what information to include',
    ],
    learnMoreHref: '/legal/terms/modules/profiles',
  },
  articles: {
    title: 'Article Publishing Terms',
    summary:
      'Articles you publish are licensed under Creative Commons and may be federated to other platforms via ActivityPub. After 3 months, published articles become part of the community record.',
    highlights: [
      'Choose CC BY 4.0, CC BY-SA 4.0, or CC0 1.0 per article',
      'CC licenses are irrevocable once published',
      'After 3 months, content can be anonymized but not fully deleted',
      'AI-generated content is prohibited; AI-assisted tools require disclosure',
    ],
    learnMoreHref: '/legal/terms/modules/articles',
  },
  social: {
    title: 'Social and Federation Terms',
    summary:
      "Posts you publish may be federated to external Mastodon and ActivityPub servers. Once federated, content is subject to those servers' policies and we cannot guarantee deletion on remote servers.",
    highlights: [
      'Social posts are always fully deletable (no archive threshold)',
      'Federated copies on remote servers may persist after deletion',
      'All posts are CC-licensed',
      'A Delete activity is sent to known peers on deletion (best-effort)',
    ],
    learnMoreHref: '/legal/terms/modules/social',
  },
  mentoring: {
    title: 'Mentoring Session Terms',
    summary:
      'Mentoring sessions use peer-to-peer video/audio (WebRTC). Session data (whiteboard, chat) is temporary and purged shortly after the session ends. Session notes are persistent and deletable.',
    highlights: [
      'Video/audio is peer-to-peer, not recorded server-side by default',
      'Whiteboard state purged 30 minutes after session ends',
      'Florida is an all-party consent state for recordings',
      'Recording requires explicit consent of all participants',
    ],
    learnMoreHref: '/legal/terms/modules/mentoring',
  },
  events: {
    title: 'Event Terms',
    summary:
      'Event records become part of the community record after the event completes. Event photos are CC-licensed and archived 3 months after the event.',
    highlights: [
      'Photo uploads require CC BY or CC BY-SA license',
      'All-party consent required for recordings at events',
      'Event photo policy (allowed/restricted/prohibited) set per event',
      'RSVP and attendance data is deletable on request',
    ],
    learnMoreHref: '/legal/terms/modules/events',
  },
  uploads: {
    title: 'Upload Terms',
    summary:
      'All uploaded media must be CC BY or CC BY-SA licensed. You must own or have rights to the content. Uploads are stored on Cloudflare R2.',
    highlights: [
      'No "all rights reserved" content allowed',
      'DMCA takedown process available for copyright claims',
      'CSAM and prohibited content subject to mandatory reporting',
      'Media follows the retention class of its parent content',
    ],
    learnMoreHref: '/legal/terms/modules/uploads',
  },
  payments: {
    title: 'Payment Terms',
    summary:
      'Donations, memberships, and merchandise payments are processed through Stripe. Buyer contact details may be synchronized to GoHighLevel for customer communication. Transaction records are retained by Stripe for at least 7 years per legal requirements, even after account deletion.',
    highlights: [
      'Stripe for donations, memberships, and merchandise',
      'GoHighLevel may receive buyer contact and subscription tags',
      'Stripe customer deletion initiated on account deletion',
      'Transaction history retained by Stripe for 7+ years (tax/legal)',
      'Active subscriptions cancelled before account deletion',
    ],
    learnMoreHref: '/legal/terms/modules/payments',
  },
};

const STORAGE_PREFIX = 'panamia_disclosure_';

export function ContextualDisclosure({
  module,
  version = '1.0.0',
  children,
  onAccept,
}: {
  module: LegalModule;
  version?: string;
  children: React.ReactNode;
  onAccept?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  const storageKey = `${STORAGE_PREFIX}${module}_v${version}`;
  const disclosure = moduleDisclosures[module];

  useEffect(() => {
    const accepted = localStorage.getItem(storageKey);
    if (!accepted) {
      setOpen(true);
    } else {
      setChecked(true);
    }
  }, [storageKey]);

  function handleAccept() {
    localStorage.setItem(storageKey, new Date().toISOString());
    setChecked(true);
    setOpen(false);
    onAccept?.();
  }

  if (checked) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{disclosure.title}</DialogTitle>
            <DialogDescription>{disclosure.summary}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm font-medium">Key points:</p>
            <ul className="text-muted-foreground space-y-1.5 text-sm">
              {disclosure.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="mt-1 shrink-0 text-green-600">*</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Link
              href={disclosure.learnMoreHref}
              className="text-muted-foreground hover:text-foreground text-sm underline"
              target="_blank"
            >
              Read full terms
            </Link>
            <Button onClick={handleAccept}>I Understand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
