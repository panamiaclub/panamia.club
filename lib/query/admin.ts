import axios from "axios";
import { useQuery } from "@tanstack/react-query";

export const profilesQueryKey = ['profiles'];

export interface AdminProfileInterface {
    name: string,
    email: string,
    handle: string,
    phone: string,
}

export async function fetchAdminActiveProfiles() {
  const profiles = await axios
  .get(
      `/api/admin/allProfiles`,
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
  if (profiles) {
      return profiles.data.data;
  }
  return { data: { message: ""}};
}

export const useAdminActiveProfiles = () => {
    return useQuery<AdminProfileInterface[], Error>({
        queryKey: profilesQueryKey,
        queryFn: () => fetchAdminActiveProfiles(),
    });
};