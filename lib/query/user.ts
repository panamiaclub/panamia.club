import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { UserInterface } from "@/lib/interfaces";

export const userQueryKey = ['user'];

export async function fetchUser() {
    const user = await axios
    .get(
        "/api/user/get",
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
    if (user) {
        return user.data.data;
    }
    return { data: { message: ""}};
}


export const useUser = () => {
    return useQuery<UserInterface, Error>({
        queryKey: userQueryKey,
        queryFn: () => fetchUser(),
    });
};

export const useMutateUserFollowing = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (updates: any) => {
          return axios.post("/api/user/updateFollowing", updates);
        },
        onSuccess: (response) => {
          console.log(response.data.msg);
          queryClient.invalidateQueries({
            queryKey: userQueryKey
          });
          return queryClient.setQueryData(userQueryKey, response.data.data);
        },
        onError: () => {
          alert('Failed to update. Please contact us.');
        }
      })
}