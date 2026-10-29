'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import { usesNativeAppLayout } from '@/lib/mobile/app-navigation';

const NativeApp = dynamic(() => import('./NativeApp'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#fff7ec',
      }}
    >
      Opening Pana Mia...
    </div>
  ),
});

export function NativeAppLayout({
  children,
  header,
  footer,
  surfaceId,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  surfaceId: string;
}) {
  const native = useIsNativeApp();
  const pathname = usePathname() || '/';
  if (!native || !usesNativeAppLayout(pathname)) {
    return (
      <>
        {header}
        <div id="layout-main">{children}</div>
        {footer}
      </>
    );
  }
  return <NativeApp surfaceId={surfaceId}>{children}</NativeApp>;
}
