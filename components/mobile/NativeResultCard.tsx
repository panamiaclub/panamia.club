'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Bookmark,
  CalendarDays,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Store,
  Users,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { NativeResult } from '@/lib/mobile/browse';
import { useSaveEvent, useSavedEvents } from '@/lib/query/native-app';
import { useNativeViewer } from './native-app-context';
import styles from './native-app.module.css';

export function NativeNotice({
  title,
  children,
  onRetry,
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <div
      className={styles.notice}
      role={onRetry ? 'alert' : 'status'}
      aria-busy={busy}
    >
      <strong>{title}</strong>
      {children && <div>{children}</div>}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function NativeEventSave({
  slug,
  title = 'event',
}: {
  slug: string;
  title?: string;
}) {
  const { signedIn, viewerKey } = useNativeViewer();
  const pathname = usePathname() || '/d';
  const search = useSearchParams();
  const savedQuery = useSavedEvents(viewerKey, signedIn);
  const mutation = useSaveEvent();
  const saved = savedQuery.data?.events.some((event) => event.slug === slug);
  if (!signedIn) {
    const eventPath = `/e/${encodeURIComponent(slug)}`;
    const callback =
      pathname === eventPath
        ? `${pathname}${search?.size ? `?${search}` : ''}`
        : eventPath;
    return (
      <Link
        className={styles.save}
        href={`/signin?callbackUrl=${encodeURIComponent(callback)}`}
        aria-label={`Sign in to save ${title}`}
      >
        <Bookmark size={18} aria-hidden="true" />
      </Link>
    );
  }
  const busy = savedQuery.isPending || mutation.isPending;
  return (
    <button
      type="button"
      className={styles.save}
      data-saved={saved || undefined}
      aria-pressed={Boolean(saved)}
      aria-label={
        savedQuery.isError
          ? 'Retry loading saved events'
          : `${saved ? 'Unsave' : 'Save'} ${title}`
      }
      disabled={busy}
      onClick={() => {
        if (savedQuery.isError) {
          void savedQuery.refetch();
          return;
        }
        mutation.mutate(
          { slug, saved: !saved },
          {
            onError: (error) =>
              toast({
                title: 'Could not update saved event',
                description: error.message,
                variant: 'destructive',
              }),
          }
        );
      }}
    >
      {busy ? (
        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
      ) : savedQuery.isError ? (
        <RefreshCw size={18} aria-hidden="true" />
      ) : (
        <Bookmark
          size={18}
          fill={saved ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export function NativeResultCard({
  item,
  square = false,
  selected = false,
}: {
  item: NativeResult;
  square?: boolean;
  selected?: boolean;
}) {
  const Icon =
    item.kind === 'event'
      ? CalendarDays
      : item.kind === 'group'
        ? Users
        : Store;
  return (
    <article
      className={styles.card}
      data-kind={item.kind}
      data-layout={square ? 'square' : 'row'}
      data-selected={selected || undefined}
      data-result-id={item.id}
    >
      <Link href={item.href} className={styles.cardLink}>
        <span className={styles.cardImage}>
          {item.image ? (
            <img src={item.image} alt="" loading="lazy" />
          ) : (
            <Icon size={28} aria-hidden="true" />
          )}
        </span>
        <span className={styles.cardBody}>
          {item.when && (
            <span className={styles.when}>
              <CalendarDays size={12} aria-hidden="true" />
              {item.when}
            </span>
          )}
          <strong className={styles.cardTitle}>{item.title}</strong>
          {item.description && (
            <span className={styles.cardDescription}>{item.description}</span>
          )}
          <span className={styles.cardLocation}>
            {item.kind !== 'group' && <MapPin size={12} aria-hidden="true" />}
            {item.location}
          </span>
          <span className={styles.cardMeta}>{item.meta}</span>
          {item.annotation && (
            <span className={styles.annotation}>{item.annotation}</span>
          )}
        </span>
      </Link>
      {item.kind === 'event' && item.slug && (
        <NativeEventSave slug={item.slug} title={item.title} />
      )}
    </article>
  );
}
