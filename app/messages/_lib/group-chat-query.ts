'use client';

import axios from 'axios';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { socialQueryKey } from '@/lib/query/social';
import type {
  GroupChatInput,
  GroupChatList,
  GroupChatMessage,
  GroupChatPage,
} from '@/lib/chat';
import { conversationUnavailable } from './workspace';

const groupChatKey = [socialQueryKey, 'messages', 'groups'];
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}
function confirmed<T>(body: Envelope<T>, fallback: string): T {
  if (!body?.success || !body.data)
    throw new Error(typeof body?.error === 'string' ? body.error : fallback);
  return body.data;
}
const roomUrl = (handle: string) =>
  `/api/social/groups/${encodeURIComponent(handle)}/chat`;
const retry = (failures: number, error: Error) =>
  !conversationUnavailable(error) && failures < 2;

export function useGroupChats(enabled: boolean) {
  return useQuery({
    queryKey: [...groupChatKey, 'conversations'],
    queryFn: async ({ signal }): Promise<GroupChatList> => {
      const { data } = await axios.get<Envelope<GroupChatList>>(
        '/api/social/messages/groups',
        { signal }
      );
      return confirmed(data, 'Could not load group chats.');
    },
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry,
  });
}

export function useGroupChatThread(handle: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...groupChatKey, 'conversation', handle],
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }): Promise<GroupChatPage> => {
      if (!handle) throw new Error('No group chat selected.');
      const { data } = await axios.get<Envelope<GroupChatPage>>(
        roomUrl(handle),
        {
          signal,
          params: pageParam ? { cursor: pageParam } : undefined,
        }
      );
      return confirmed(data, 'Could not open this group chat.');
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && !!handle,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry,
  });
}

export function mergeGroupChatPages(
  pages: GroupChatPage[] | undefined
): GroupChatMessage[] {
  const byId = new Map<string, GroupChatMessage>();
  for (const page of [...(pages ?? [])].reverse()) {
    for (const message of page.messages) byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.published).getTime() - new Date(b.published).getTime() ||
      a.id.localeCompare(b.id)
  );
}

export function useSendGroupChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      handle,
      ...input
    }: GroupChatInput & { handle: string }) => {
      const { data } = await axios.post<Envelope<GroupChatMessage>>(
        roomUrl(handle),
        input,
        { timeout: 20_000 }
      );
      const message = confirmed(data, 'Could not confirm message delivery.');
      if (typeof message.id !== 'string' || !message.id)
        throw new Error('Could not confirm message delivery.');
      return message;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: groupChatKey });
    },
  });
}

export function useDeleteGroupChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      handle,
      messageId,
    }: {
      handle: string;
      messageId: string;
    }) => {
      const { data } = await axios.delete<Envelope<{ id: string }>>(
        `${roomUrl(handle)}/${encodeURIComponent(messageId)}`,
        { timeout: 20_000 }
      );
      return confirmed(data, 'Could not remove this message.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: groupChatKey });
    },
  });
}
