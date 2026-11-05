'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { directMessageHref } from '@/app/messages/_lib/inbox';

export function SendMessageButton({
  actorId,
  name,
}: {
  actorId: string;
  name: string;
}) {
  const { t } = useTranslation('profile');
  return (
    <Button asChild size="sm" variant="outline" className="min-h-11">
      <Link
        href={directMessageHref(actorId)}
        aria-label={t('messaging.open', { name })}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {t('messaging.button')}
      </Link>
    </Button>
  );
}
