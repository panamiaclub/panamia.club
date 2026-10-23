'use client';

import { useCallback, useEffect, useState } from 'react';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { useTranslation } from 'react-i18next';
import { ImagePlus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeBareIdentity, IDENTITY_DISMISS_KEY } from '@/lib/onboarding';

/* Asks for a name and a face — but only after the member has posted.
 *
 * The timing is the whole point. Asked up front, on a page nobody requested,
 * "add a photo" is a chore standing between somebody and the thing they came
 * for. Asked immediately after their words go up under a bare handle, it is an
 * answer to a question they are already asking themselves: that's me? So this
 * renders on the success of a post and never before it.
 *
 * It nudges, it does not gate. The post is already published by the time this
 * appears, nothing is withheld, and "Not now" makes it go away for the rest of
 * the browser session. A first post is a fragile thing and this must not read
 * as a bill arriving for it.
 */

interface IdentityPromptProps {
  actorId?: string | null;
  name?: string | null;
  username?: string | null;
  iconUrl?: string | null;
}

export function IdentityPrompt({
  actorId,
  name,
  username,
  iconUrl,
}: IdentityPromptProps) {
  const { t } = useTranslation('common');

  /* Starts hidden and is revealed once sessionStorage has been read. The other
     order — assume visible, hide on read — flashes the card at somebody who
     already dismissed it, which is exactly the nagging this is trying not to
     do. sessionStorage is unavailable in SSR and can throw outright in a
     locked-down browser, so the read is deferred and guarded. */
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!actorId) return;
    try {
      setDismissed(
        window.sessionStorage.getItem(IDENTITY_DISMISS_KEY) === actorId
      );
    } catch {
      setDismissed(false);
    }
  }, [actorId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (!actorId) return;
    try {
      window.sessionStorage.setItem(IDENTITY_DISMISS_KEY, actorId);
    } catch {
      /* Private mode. The card is gone for this render either way; the only
         loss is that it can come back after a reload. */
    }
  }, [actorId]);

  const { needsName, needsAvatar } = describeBareIdentity({
    name,
    username,
    iconUrl,
  });

  if (dismissed || !username) return null;
  if (!needsName && !needsAvatar) return null;

  const body =
    needsName && needsAvatar
      ? t('onboarding.identityBodyBoth')
      : needsName
        ? t('onboarding.identityBodyName')
        : t('onboarding.identityBodyAvatar');

  return (
    <section
      className="feed-module mt-4"
      aria-labelledby="feed-identity-prompt"
    >
      <h2 id="feed-identity-prompt" className="feed-module-title">
        {t('onboarding.identityTitle', { screenname: username })}
      </h2>
      <p className="text-pana-ink/60 mt-0.5 text-[13px] font-medium">{body}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {needsName && (
          <Button asChild size="sm">
            <SurfaceLink href="/account/user/edit">
              <UserRound className="mr-1.5 h-4 w-4" />
              {t('onboarding.identityAddName')}
            </SurfaceLink>
          </Button>
        )}
        {needsAvatar && (
          <Button asChild size="sm" variant={needsName ? 'outline' : 'default'}>
            <SurfaceLink href="/account/user/edit#profile-images">
              <ImagePlus className="mr-1.5 h-4 w-4" />
              {t('onboarding.identityAddPhoto')}
            </SurfaceLink>
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t('onboarding.identityDismiss')}
        </Button>
      </div>
    </section>
  );
}
