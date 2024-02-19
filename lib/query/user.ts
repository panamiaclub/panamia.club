import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProfileInterface, UserInterface } from "@/lib/interfaces";

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

export async function fetchUserFollowing() {
  const user = await axios
  .get(
      "/api/user/getFollowing",
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

export const useUserFollowing = () => {
  return useQuery<ProfileInterface[], Error>({
      queryKey: [userQueryKey, "following"],
      queryFn: () => fetchUserFollowing(),
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
          queryClient.invalidateQueries({
            queryKey: [userQueryKey, "following"]
          });
          return queryClient.setQueryData(userQueryKey, response.data.data);
        },
        onError: () => {
          alert('Failed to update. Please contact us.');
        }
      })
}