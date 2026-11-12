'use client';

import { useEffect, useRef } from 'react';
import type { MessageDraft } from './workspace';

export function usePrivateDraftUrls(drafts: Record<string, MessageDraft>) {
  const owned = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(
      Object.values(drafts).flatMap((draft) =>
        [draft.photo?.url, draft.gif?.url].filter(
          (url): url is string => !!url?.startsWith('blob:')
        )
      )
    );
    for (const url of owned.current)
      if (!current.has(url)) URL.revokeObjectURL(url);
    owned.current = current;
  }, [drafts]);
  useEffect(
    () => () => {
      for (const url of owned.current) URL.revokeObjectURL(url);
      owned.current.clear();
    },
    []
  );
}
