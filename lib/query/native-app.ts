import axios from 'axios';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { DiscoveryEvent } from '@/lib/events/lanes';
import type { NativeEvent } from '@/lib/mobile/browse';
import type { GroupSearchResponse, GroupSort } from '@/lib/query/social';

const PAGE_SIZE = 24;
export const nativeAppQueryKey = ['native-app'];
export const savedEventsKey = [...nativeAppQueryKey, 'saved-events'];

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function getData<T>(url: string, signal?: AbortSignal): Promise<T> {
  const { data } = await axios.get<ApiEnvelope<T>>(url, { signal });
  if (!data.success || data.data === undefined) {
    throw new Error(data.error || 'Could not load this content');
  }
  return data.data;
}

export function useNativeEvents(term: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...nativeAppQueryKey, 'events', term],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getData<{ events: NativeEvent[]; hasMore: boolean }>(
        `/api/events?${new URLSearchParams({
          q: term,
          limit: String(PAGE_SIZE),
          offset: String(pageParam),
        })}`,
        signal
      ),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * PAGE_SIZE : undefined,
    enabled,
  });
}

export function useNativeGroups(
  term: string,
  enabled: boolean,
  topic = '',
  sort: GroupSort = 'active'
) {
  return useInfiniteQuery({
    queryKey: [...nativeAppQueryKey, 'groups', term, topic, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getData<GroupSearchResponse>(
        `/api/social/groups?${new URLSearchParams({
          q: term,
          topic,
          sort,
          limit: String(PAGE_SIZE),
          offset: String(pageParam),
        })}`,
        signal
      ),
    getNextPageParam: (last, pages) =>
      last.groups.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    enabled,
  });
}

export function useNativeDiscovery(viewerKey: string, enabled: boolean) {
  return useQuery({
    queryKey: [...nativeAppQueryKey, 'discovery', viewerKey],
    queryFn: ({ signal }) =>
      getData<{
        events: DiscoveryEvent[];
        dismissedIds: string[];
        signedIn: boolean;
      }>('/api/discover/events', signal),
    enabled,
  });
}

export function useSavedEvents(viewerKey: string, enabled: boolean) {
  return useQuery({
    queryKey: [...savedEventsKey, viewerKey],
    queryFn: ({ signal }) =>
      getData<{ events: NativeEvent[] }>(
        '/api/social/actors/me/saved-events',
        signal
      ),
    enabled,
  });
}

export function useSaveEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, saved }: { slug: string; saved: boolean }) => {
      const url = `/api/events/${encodeURIComponent(slug)}/save`;
      const { data, status } = await axios.request<
        ApiEnvelope<{ saved: boolean }>
      >({
        url,
        method: saved ? 'POST' : 'DELETE',
        validateStatus: () => true,
      });
      if (status < 200 || status >= 300 || !data?.success) {
        throw new Error(data?.error || 'Could not update saved event');
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: savedEventsKey }),
  });
}
