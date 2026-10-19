'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ExternalLink, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMyActor } from '@/lib/query/social';
import {
  SHARED_ROOMS,
  SURFACE_BLURB,
  SURFACE_TONE,
} from '@/lib/panaverse/branding';
import type { SurfaceId } from '@/lib/panaverse/surfaces';

/**
 * One surface as the switcher needs to render it.
 *
 * `href` is resolved on the server and passed down rather than computed here.
 * `originForFrom` reads PANAVERSE_ROOT_DOMAIN, which is a Worker var and not a
 * NEXT_PUBLIC_ one, so in a client bundle it is simply absent and the helper
 * would silently fall back to the compiled-in default. That is correct today
 * and would be wrong the moment the root domain is configured to anything
 * else — a class of bug that shows up only in the environment you cannot test
 * locally. Resolving server-side keeps the env read where the env exists.
 */
export interface SurfaceLink {
  id: SurfaceId;
  name: string;
  /** The host this link actually goes to, shown so the member can see where
   *  they are being taken. Derived from `href`, never named independently. */
  hostname: string;
  /** Absolute origin + rootPath. Absolute because crossing surfaces really
   *  does mean crossing origins; that is the thing being navigated. */
  href: string;
}

/**
 * The panaverse switcher.
 *
 * The problem it solves is not navigation — a link would do that. It is that
 * panamia.club and social.panamia.club are different origins, so without
 * something saying otherwise, arriving at the second one reads as having been
 * handed off to a different company's product.
 *
 * So it leads with identity rather than with a list of links. The first thing
 * in the panel is who you are and the handle that is the same in every room;
 * the destinations come after. An app-grid of equal tiles — the pattern this
 * could easily have been — says "here are our products". This says "here is
 * you, and here is where you can take yourself".
 *
 * The handle is the load-bearing element and is genuinely load-bearing rather
 * than decoratively so: it is minted against the federation domain, so it is
 * the same string on every surface and on every other fediverse server.
 */
export function SurfaceSwitcher({
  surfaces,
  currentId,
}: {
  surfaces: SurfaceLink[];
  currentId: SurfaceId;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: me } = useMyActor();
  const actor = me?.actor ?? null;

  const current = surfaces.find((s) => s.id === currentId) ?? surfaces[0];

  /* Dismiss on outside click and on Escape. A switcher that traps you inside
     it is a worse version of the problem it exists to solve. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const displayName = actor?.name || actor?.username || null;
  const handle = actor ? `@${actor.username}@${actor.domain}` : null;

  return (
    <div className="surface-switcher" ref={rootRef}>
      <button
        type="button"
        className="surface-pill"
        data-tone={SURFACE_TONE[current.id]}
        aria-expanded={open}
        aria-haspopup="menu"
        /* Named explicitly because the visible label is hidden below 480px to
           keep the masthead from overflowing. Without this the button would
           lose its accessible name at exactly the width where the surrounding
           context is thinnest. */
        aria-label={`Switch surface, currently ${current.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="surface-dot" aria-hidden="true" />
        <span className="surface-pill-name">{current.name}</span>
        <ChevronDown
          className="h-3.5 w-3.5 flex-none transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="surface-panel" role="menu" aria-label="Panaverse">
          {/* Identity first — but only when there is an identity to lead with.
              A signed-out visitor gets the destinations without a hollow
              name-shaped placeholder above them. */}
          {actor && (
            <>
              <div className="surface-panel-identity">
                <Avatar className="h-11 w-11 flex-none">
                  <AvatarImage src={actor.iconUrl || undefined} alt="" />
                  <AvatarFallback>
                    {(displayName ?? '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="surface-identity-name truncate">
                    {displayName}
                  </p>
                  <p className="surface-identity-handle truncate">{handle}</p>
                </div>
              </div>

              <p className="surface-panel-note">
                One Pana account. Same you in every room.
              </p>
            </>
          )}

          <div className="surface-panel-group">
            {surfaces.map((surface) => {
              const isCurrent = surface.id === current.id;
              return (
                <a
                  key={surface.id}
                  href={surface.href}
                  role="menuitem"
                  className="surface-option"
                  data-tone={SURFACE_TONE[surface.id]}
                  data-current={isCurrent}
                  /* `aria-current` rather than relying on the visible "You're
                     here" badge, which is inside a nested span a screen reader
                     reaches only after the surface name. */
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="surface-dot mt-1" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="surface-option-head">
                      <span className="surface-option-name">
                        {surface.name}
                      </span>
                      {isCurrent ? (
                        <span className="surface-here">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          You&apos;re here
                        </span>
                      ) : (
                        <ExternalLink
                          className="text-pana-ink/35 ml-auto h-3.5 w-3.5 flex-none"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="surface-option-blurb">
                      {SURFACE_BLURB[surface.id]}
                    </span>
                    <span className="surface-host">{surface.hostname}</span>
                  </span>
                </a>
              );
            })}
          </div>

          {/* Rooms. Deliberately quieter than the surfaces above: these are
              real and shipped, but they live on the main site, and giving them
              equal weight would promise a front door that does not exist.
              Relative links, so they open on the surface the member is already
              in and arrive wearing the guest chrome. */}
          <div className="surface-panel-group">
            <p className="surface-panel-label">Also on Pana Mia</p>
            {SHARED_ROOMS.map((room) => (
              <Link
                key={room.path}
                href={room.path}
                role="menuitem"
                className="surface-room"
                data-tone={room.tone}
                onClick={() => setOpen(false)}
              >
                <span className="surface-dot" aria-hidden="true" />
                <span className="surface-room-name">{room.name}</span>
                <span className="surface-room-blurb">{room.blurb}</span>
              </Link>
            ))}
          </div>

          {/* One settings page for the whole panaverse. Per-surface settings
              would mean a member has to remember which room they changed their
              email in. */}
          <Link
            href="/account"
            className="surface-panel-footer"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
            Account settings
            <span className="text-pana-ink/45 ml-auto text-[11px] font-bold">
              Applies everywhere
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
