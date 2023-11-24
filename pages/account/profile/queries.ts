import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProfileInterface } from "@/lib/interfaces";

export async function fetchProfile() {
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
    .catch((error) => {
        console.log(error);
    });
    if (profile) {
        return profile.data.data;
    }
    return { data: { message: ""}};
}

export const getProfile = () => {
    return useQuery<ProfileInterface, Error>({
        queryKey: ['profile'],
        queryFn: () => fetchProfile()
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
            queryKey: ['profile'],
            exact: true
          });
        },
        onError: () => {
          alert('Failed to update profile. Please contact us.');
        }
      })
}