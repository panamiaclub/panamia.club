'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listingClaimPath } from '@/lib/listing-url';

/**
 * Shown where a claimed listing shows its Pana Social updates.
 *
 * An unclaimed listing has nobody behind it to post, so the honest thing to
 * put in that slot is an invitation rather than an empty feed. It also makes
 * the difference visible: a profile with updates is one a real person is
 * tending, and that is worth being able to tell apart at a glance.
 */
export function ClaimListingCta({ profileId }: { profileId: string }) {
  const { t } = useTranslation('profile');

  return (
    <section className="surface-indigo py-16 md:py-24">
      <div className="container mx-auto max-w-3xl px-4 text-center" data-rv>
        <span className="section-eyebrow text-pana-butter">
          {t('updates.claimEyebrow')}
        </span>
        <h2 className="bizprofile-h2 mt-4">{t('updates.claimHeading')}</h2>
        <p className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed font-semibold opacity-90">
          {t('updates.claimBody')}
        </p>

        {/* The one real entry point into the claim flow, same as the one the
            directory search cards use. */}
        <Button
          size="lg"
          asChild
          className="bg-pana-flame text-pana-ink hover:bg-pana-burnt mt-8 rounded-full font-extrabold"
        >
          <Link href={listingClaimPath(profileId)}>
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {t('updates.claimCta')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
