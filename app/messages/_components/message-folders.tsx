'use client';

import { MessagesSquare } from 'lucide-react';
import styles from '@/components/messages/workspace.module.css';

export type MessageFolder = 'inbox' | 'requests';

export function MessageFolders({
  view,
  requestCount,
  onChange,
}: {
  view: MessageFolder;
  requestCount: number;
  onChange: (view: MessageFolder) => void;
}) {
  return (
    <div
      className={`${styles.folders} ${styles.inboxFolders}`}
      role="group"
      aria-label="Message folders"
    >
      <button
        type="button"
        aria-pressed={view === 'inbox'}
        onClick={() => onChange('inbox')}
      >
        <MessagesSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Messages
      </button>
      <button
        type="button"
        aria-pressed={view === 'requests'}
        onClick={() => onChange('requests')}
      >
        Requests <span className="font-medium">({requestCount})</span>
      </button>
    </div>
  );
}
