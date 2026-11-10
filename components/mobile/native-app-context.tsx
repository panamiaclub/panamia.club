'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';

export interface NativeConversation {
  onBack: () => void;
  backLabel: string;
}

export const NativeConversationContext = createContext<Dispatch<
  SetStateAction<NativeConversation | null>
> | null>(null);

export function useNativeConversation(
  onBack: (() => void) | null,
  backLabel = 'Back to conversations'
) {
  const setConversation = useContext(NativeConversationContext);
  useLayoutEffect(() => {
    if (!setConversation || !onBack) return;
    const conversation = { onBack, backLabel };
    setConversation(conversation);
    return () => {
      setConversation((current) => (current === conversation ? null : current));
    };
  }, [setConversation, onBack, backLabel]);
}

export const NativeViewerContext = createContext({
  signedIn: false,
  viewerKey: 'guest',
});

export function useNativeViewer() {
  return useContext(NativeViewerContext);
}
