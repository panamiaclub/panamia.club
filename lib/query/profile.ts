import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import i18n from '@/lib/i18n';

import { ProfileInterface } from '@/lib/interfaces';
import { directorySearchKey } from '@/lib/query/directory';
import { useSession } from '@/lib/auth-client';

export const profileQueryKey = ['profile'];
export const profilePublicQueryKey = 'publicProfile';

export function profileEditorUrl(path: string, listingId?: string): string {
  return listingId !== undefined
    ? `${path}?listingId=${encodeURIComponent(listingId)}`
    : path;
}

async function postProfileUpdate(
  path: string,
  updates: unknown,
  listingId?: string
) {
  const response = await axios.post<{ success: boolean; error?: string }>(
    profileEditorUrl(path, listingId),
    updates
  );
  if (!response.data.success) {
    throw new Error(
      response.data.error || i18n.t('profileUpdateFailed', { ns: 'toast' })
    );
  }
  return response;
}

export async function fetchProfile(listingId?: string) {
  console.log('fetchProfile');
  const profile = await axios
    .get<{ data?: ProfileInterface }>(
      profileEditorUrl('/api/getProfile', listingId),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }
    )
    .catch((error: Error) => {
      console.log(error.name, error.message);
      throw error;
    });
  if (profile?.data?.data) {
    if (listingId !== undefined && profile.data.data.id !== listingId) {
      throw new Error('The requested business listing could not be loaded.');
    }
    return profile.data.data;
  }
  throw new Error('No profile data returned');
}

export async function fetchPublicProfile(handle: string) {
  console.log('fetchPublicProfile');

  const params = new URLSearchParams();
  params.append('handle', handle);
  const profile = await axios
    .get(`/api/profile/public?${params}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    .catch((error: Error) => {
      console.log(error.name, error.message);
      throw error;
    });
  if (profile?.data?.data) {
    return profile.data.data;
  }
  throw new Error('No profile data returned');
}

export const useProfile = (listingId?: string) => {
  const { data: session, status } = useSession();
  return useQuery<ProfileInterface, Error>({
    queryKey:
      listingId !== undefined
        ? [...profileQueryKey, 'listing', listingId, session?.user?.id]
        : profileQueryKey,
    queryFn: () => fetchProfile(listingId),
    enabled: listingId === undefined || status === 'authenticated',
    retry: listingId !== undefined ? false : undefined,
  });
};

/**
 * The user's saved default CC license, used to pre-select the license picker
 * when composing new Articles (/a) and social posts (/s). Falls back to
 * 'cc-by-4' (the new-user default) while loading or if no profile is found.
 */
export const useDefaultCcLicense = (): 'cc-by-4' | 'cc-by-sa-4' | 'cc-0' => {
  const { data } = useProfile();
  return data?.defaultCcLicense ?? 'cc-by-4';
};

export const useMutateDefaultLicense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (defaultCcLicense: string) => {
      return axios.post('/api/profile/saveDefaultLicense', {
        defaultCcLicense,
      });
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: true,
      });
    },
    onError: () => {
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};

export const useMutateProfileContact = (listingId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return postProfileUpdate('/api/profile/saveContact', updates, listingId);
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: false,
      });
    },
    onError: () => {
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};

export const useMutateProfileGenteDePana = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return axios.post('/api/profile/saveGenteDePana', updates);
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: true,
      });
    },
    onError: () => {
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};

export const useMutateProfileDesc = (listingId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return postProfileUpdate('/api/profile/saveDesc', updates, listingId);
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: false,
      });
    },
    onError: () => {
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};

export const useMutateProfileSocial = (listingId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return postProfileUpdate('/api/profile/saveSocial', updates, listingId);
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: false,
      });
    },
    onError: () => {
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};

export const useMutateProfileAddress = (listingId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: unknown) => {
      return postProfileUpdate('/api/profile/saveAddress', updates, listingId);
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: profileQueryKey,
          exact: false,
        }),
        queryClient.invalidateQueries({ queryKey: [directorySearchKey] }),
        queryClient.invalidateQueries({ queryKey: [profilePublicQueryKey] }),
      ]);
    },
    onError: (error) => {
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error
        : error.message;
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: message || i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};

export const useMutateProfileCategories = (listingId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return postProfileUpdate(
        '/api/profile/saveCategories',
        updates,
        listingId
      );
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: false,
      });
    },
    onError: () => {
      toast({
        title: i18n.t('error', { ns: 'toast' }),
        description: i18n.t('profileUpdateFailed', { ns: 'toast' }),
        variant: 'destructive',
      });
    },
  });
};
