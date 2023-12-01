import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProfileInterface } from "@/lib/interfaces";

export const profileQueryKey = ['profile'];
export const profilePublicQueryKey = 'publicProfile';

export async function fetchProfile() {
    console.log("fetchProfile")
    const profile = await axios
    .get(
        "/api/getProfile",
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        }
    )
    .catch((error: Error) => {
        console.log(error.name, error.message);
    });
    if (profile) {
        return profile.data.data;
    }
    return { data: { message: ""}};
}

export async function fetchPublicProfile(handle: string) {
  console.log("fetchPublicProfile");

  const params = new URLSearchParams();
  params.append("handle", handle);
  const profile = await axios
  .get(
      `/api/profile/public?${params}`,
      {
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
          },
      }
  )
  .catch((error: Error) => {
      console.log(error.name, error.message);
  });
  if (profile) {
      return profile.data.data;
  }
  return { data: { message: ""}};
}

export const useProfile = () => {
    return useQuery<ProfileInterface, Error>({
        queryKey: profileQueryKey,
        queryFn: () => fetchProfile(),
    });
};

export const useMutateProfileContact = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (updates: any) => {
          return axios.post("/api/profile/saveContact", updates);
        },
        onSuccess: (data) => {
          alert('Succesfully updated profile');
          return queryClient.invalidateQueries({
            queryKey: profileQueryKey,
            exact: true
          });
        },
        onError: () => {
          alert('Failed to update profile. Please contact us.');
        }
      })
}

export const useMutateProfileDesc = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (updates: any) => {
          return axios.post("/api/profile/saveDesc", updates);
        },
        onSuccess: (data) => {
          alert('Succesfully updated profile');
          return queryClient.invalidateQueries({
            queryKey: profileQueryKey,
            exact: true
          });
        },
        onError: () => {
          alert('Failed to update profile. Please contact us.');
        }
      })
}

export const useMutateProfileSocial = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (updates: any) => {
          return axios.post("/api/profile/saveSocial", updates);
        },
        onSuccess: (data) => {
          alert('Succesfully updated profile');
          return queryClient.invalidateQueries({
            queryKey: profileQueryKey,
            exact: true
          });
        },
        onError: () => {
          alert('Failed to update profile. Please contact us.');
        }
      })
}

export const useMutateProfileAddress = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (updates: any) => {
          return axios.post("/api/profile/saveAddress", updates);
        },
        onSuccess: (data) => {
          alert('Succesfully updated profile');
          return queryClient.invalidateQueries({
            queryKey: profileQueryKey,
            exact: true
          });
        },
        onError: () => {
          alert('Failed to update profile. Please contact us.');
        }
      })
}

export const useMutateProfileCategories = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (updates: any) => {
          return axios.post("/api/profile/saveCategories", updates);
        },
        onSuccess: (data) => {
          alert('Succesfully updated profile');
          return queryClient.invalidateQueries({
            queryKey: profileQueryKey,
            exact: true
          });
        },
        onError: () => {
          alert('Failed to update profile. Please contact us.');
        }
      })
}