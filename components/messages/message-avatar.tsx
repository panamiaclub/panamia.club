'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import styles from './workspace.module.css';

export function MessageAvatar({
  identity,
  name,
  imageUrl,
  size = 40,
}: {
  identity: string;
  name: string;
  imageUrl?: string | null;
  size?: number;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || '?';
  const tone = Array.from(identity).reduce(
    (value, character) => (value + character.charCodeAt(0)) % 3,
    0
  );

  return (
    <Avatar
      className={styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <AvatarImage
        src={imageUrl || undefined}
        alt=""
        className="object-cover"
      />
      <AvatarFallback className={styles.avatarFallback} data-tone={tone}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
