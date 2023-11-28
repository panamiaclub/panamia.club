import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProfileInterface } from "@/lib/interfaces";

export const profileQueryKey = ['profile'];

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

export const useProfile = () => {
    return useQuery<ProfileInterface, Error>({
        queryKey: profileQueryKey,
        queryFn: () => fetchProfile(),
    });
};

export const mutateProfileContact = () => {
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

export const mutateProfileDesc = () => {
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

export const mutateProfileSocial = () => {
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

export const mutateProfileAddress = () => {
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

export const mutateProfileCategories = () => {
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