'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DirectorySuggest } from '@/components/directory-suggest';
import { ScopeMenuLive } from '@/components/scope-menu-live';
import { scopePlaceholderShortKey, type Scope } from '@/lib/directory-scopes';

/**
 * The search field a surface carries in the middle of its masthead.
 *
 * It was a plain GET form, so that it worked before the bundle landed and on a
 * page with JavaScript off. It is now the club-wide typeahead, which keeps
 * that: `DirectorySuggest` renders a real GET with a real `name="q"` and only
 * preventDefaults once hydrated, so the no-JS path is the same document
 * navigation it always was. That is also why it still sidesteps the
 * stale-chrome problem `SurfaceLink` exists for — submitting reaches the
 * server, which picks the chrome again on the way in.
 *
 * THE FIELD USED TO COMMIT TO ONE SCOPE, and that reasoning is worth keeping
 * because part of it still holds. The field once pointed at Pana Social's own
 * `/search`, which covered Panas and groups; it then briefly pointed at the
 * directory's Everything scope, which covered all four kinds. Everything is
 * gone — the search box searches exactly one kind, named by the control next
 * to it — and the argument was that a 2.125rem bar had no room for that
 * control.
 *
 * That turned out to be true of the trigger rather than of the bar. `ScopeMenu`
 * now has a `compact` variant that fits, so the field offers the choice its
 * placeholder was already narrowing for, and a member reaches all four kinds
 * from the surface instead of being sent to the homepage for three of them.
 *
 * THE SIGN-IN-WALL HAZARD IS REAL, AND IS NOT ANSWERED BY WHO SEES THIS FIELD.
 * The note here used to say that a masthead "sits in chrome that does not know
 * who is looking", and concluded that a gated scope would answer an anonymous
 * visitor with a wall. The first half is exactly right: `wearsSurfaceChrome`
 * takes a surface and a pathname and never a session, so this renders for
 * signed-out visitors too, on every public room the surface owns. `/groups` is
 * the plain case — documented public either way — and a guest there gets this
 * masthead. `SurfaceMemberHeader` is named for the surface's own rooms, not
 * for who is reading them.
 *
 * What answers the hazard is the menu, not the audience. `ScopeMenuLive` reads
 * the session itself and hands `signedIn` to `ScopeMenu`, which draws the
 * members-only row locked and skips it with the arrow keys. Panas is the only
 * gated scope; the directory, events and groups are public. So a signed-out
 * visitor is never offered a door that will not open, and the homepage has
 * shown this same menu to guests on the same terms since it shipped.
 *
 * The masthead supplies the initial scope: Events starts with events, while
 * Social keeps its groups default. This is server-rendered, so the placeholder,
 * menu and GET action agree even without JavaScript. The menu can still change
 * what the visitor searches after hydration.
 *
 * Client rather than server, which it was: the chosen scope is state, and it
 * has to narrow the placeholder and retarget the form between renders.
 */
export function SurfaceSearch({ initialScope }: { initialScope: Scope }) {
  const { t: tCommon } = useTranslation('common');

  /* Held here rather than in the URL, the same way the home hero holds it.
     Nothing has been searched yet from a masthead — picking a scope is
     choosing a question, and submitting is asking it. */
  const [scope, setScope] = useState<Scope>(initialScope);

  /* The visible placeholder and the accessible name, one string from one key,
     exactly as the hero does it. Reused rather than given its own strings
     because the short placeholder is already the shortest true sentence about
     what this box searches, which is what a label is; matching the two also
     satisfies label-in-name, so someone saying "search events" hits the thing
     the screen says "Search events".

     The surface's name is deliberately no longer in it. It read well while the
     field could only search the surface's own kind, and would be wrong now
     that it can search the directory: "Search Pana Social the directory" names
     the wrong owner for a scope the surface does not own. */
  const label = tCommon(scopePlaceholderShortKey(scope));

  return (
    <DirectorySuggest
      layout="masthead"
      scope={scope}
      className="panaverse-search"
      label={label}
      ariaLabel={label}
      placeholder={label}
      leading={
        /* `term=""`, and it must stay that way. `ScopeMenuLive` fetches
           `/api/directory/scope-counts` from an effect that early-returns on a
           falsy term, and this masthead renders on every page of the surface —
           wiring a real term in here would buy a request per page view for
           numbers nobody asked for. The counts are decoration on a control
           that is navigation first, and the masthead does without them.

           `onSelect` rather than links, like the hero and unlike the results
           pages. A results page has a real route per scope; here there is
           nothing to navigate to yet, so the rows set state and submit carries
           the chosen scope. Links would turn choosing a scope into leaving. */
        <ScopeMenuLive scope={scope} term="" onSelect={setScope} compact />
      }
    />
  );
}
