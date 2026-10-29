'use client';

import { createContext, useContext } from 'react';

export const NativeViewerContext = createContext({
  signedIn: false,
  viewerKey: 'guest',
});

export function useNativeViewer() {
  return useContext(NativeViewerContext);
}
