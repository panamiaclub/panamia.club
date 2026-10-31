import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import i18n from '@/lib/i18n';

import { ProfileInterface } from '@/lib/interfaces';
import { directorySearchKey } from '@/lib/query/directory';

export const profileQueryKey = ['profile'];
export const profilePublicQueryKey = 'publicProfile';

export async function fetchProfile() {
  console.log('fetchProfile');
  const profile = await axios
    .get('/api/getProfile', {
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

export const useProfile = () => {
  return useQuery<ProfileInterface, Error>({
    queryKey: profileQueryKey,
    queryFn: () => fetchProfile(),
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

export const useMutateProfileContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return axios.post('/api/profile/saveContact', updates);
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

export const useMutateProfileDesc = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return axios.post('/api/profile/saveDesc', updates);
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

export const useMutateProfileSocial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return axios.post('/api/profile/saveSocial', updates);
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

export const useMutateProfileAddress = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: unknown) => {
      const response = await axios.post<{ success: boolean; error?: string }>(
        '/api/profile/saveAddress',
        updates
      );
      if (!response.data.success) {
        throw new Error(
          response.data.error || i18n.t('profileUpdateFailed', { ns: 'toast' })
        );
      }
      return response;
    },
    onSuccess: () => {
      toast({
        title: i18n.t('success', { ns: 'toast' }),
        description: i18n.t('profileUpdated', { ns: 'toast' }),
      });
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: profileQueryKey,
          exact: true,
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

export const useMutateProfileCategories = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: unknown) => {
      return axios.post('/api/profile/saveCategories', updates);
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
