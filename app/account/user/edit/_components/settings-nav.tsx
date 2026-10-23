'use client';

import { useEffect, useState } from 'react';
import {
  AtSign,
  Database,
  KeyRound,
  Megaphone,
  Scale,
  Share2,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SettingScope } from './settings-primitives';

export type SectionId =
  | 'identity'
  | 'profile'
  | 'signin'
  | 'referrals'
  | 'publishing'
  | 'messages'
  | 'data';

export interface SettingsSection {
  id: SectionId;
  /** Nav label. Short, because the nav is a margin column, not a menu. */
  label: string;
  /** Section heading, which can afford to be a sentence fragment. */
  heading: string;
  lede: string;
  scope: SettingScope;
  icon: LucideIcon;
}

/* Ordered by how often a member comes here for it. Identity first because
   "what is my name and handle" is the reason most people open settings at all;
   data last because it is the section you visit once.

   This replaces the old split, which was a form headed "Update Your Account
   Settings" and an accordion headed "Advanced Settings". That split described
   how risky the developers felt each control was rather than what any of them
   were for — which is how marketing consent, a legally meaningful choice, ended
   up collapsed behind the same summary row as a key rotation. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'identity',
    label: 'Identity',
    heading: 'Who you are',
    lede: 'Your name and screenname travel with every post, article, and listing you touch. Your handle is built from your screenname, so the two can never drift apart.',
    scope: 'everywhere',
    icon: AtSign,
  },
  {
    id: 'profile',
    label: 'Public profile',
    heading: 'What people see',
    lede: 'Your bio, links, categories, location, offers, and profile images now live here instead of the retired profile dashboard.',
    scope: 'everywhere',
    icon: UserRound,
  },
  {
    id: 'signin',
    label: 'Sign-in & keys',
    heading: 'How you get in',
    lede: 'One email signs you into every surface. Your Nostr keys sign what you publish, and only you hold them.',
    scope: 'everywhere',
    icon: KeyRound,
  },
  {
    id: 'referrals',
    label: 'Referrals',
    heading: 'Bring someone into Pana',
    lede: 'Share one stable invitation. It independently tracks when someone creates an account, submits a directory application, or becomes a Community Connector.',
    scope: 'everywhere',
    icon: Share2,
  },
  {
    id: 'publishing',
    label: 'Publishing',
    heading: 'How your work is licensed',
    lede: 'The licence pre-selected when you compose. You can still change it on any individual article or post.',
    scope: 'everywhere',
    icon: Scale,
  },
  {
    id: 'messages',
    label: 'Messages',
    heading: 'Messages from Pana Mia',
    lede: 'Each channel is a separate choice, and each one can be off without the others. Sign-in links you request yourself are never affected.',
    scope: 'everywhere',
    icon: Megaphone,
  },
  {
    id: 'data',
    label: 'Your data',
    heading: 'Your data',
    lede: 'What we hold, where it came from, and how to get rid of it.',
    scope: 'everywhere',
    icon: Database,
  },
];

/* A table of contents for a page that is now long enough to need one.
 *
 * It is a column of rules in the margin rather than a filled sidebar, because a
 * solid panel at this width reads as app chrome, and app chrome is the register
 * this redesign is trying to leave. Below the lg breakpoint it becomes a
 * scrolling row above the content — still the whole list, still in order. */
export function SettingsNav() {
  const [active, setActive] = useState<SectionId>(SETTINGS_SECTIONS[0].id);

  /* Tracked rather than set on click. A nav that only updates when you use it
     is lying for as long as you scroll by hand, and scrolling by hand is how
     most of this page gets read. */
  useEffect(() => {
    const nodes = SETTINGS_SECTIONS.map((section) =>
      document.getElementById(section.id)
    ).filter((node): node is HTMLElement => node !== null);

    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        /* The topmost section currently crossing the band below the header
           wins. Taking the first intersecting entry in document order avoids
           the flicker you get from reacting to whichever entry fired last. */
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActive(visible[0].target.id as SectionId);
      },
      /* A band just under the site header, not the whole viewport: with a full
         viewport every long section matches at once.

         Pixels, not rem — rootMargin only parses px and %, and a rem value
         throws rather than degrading. 96px is the 6rem the sections reserve via
         scroll-margin-top. */
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      className="settings-nav -mx-1 px-1 lg:sticky lg:top-24 lg:mx-0 lg:px-0"
      aria-label="Settings sections"
    >
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="settings-nav-item"
            data-active={section.id === active}
            aria-current={section.id === active ? 'true' : undefined}
          >
            <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}
