import axios from "axios";
import { useQuery } from "@tanstack/react-query";

export const userlistPublicQueryKey = ['userlistPublic'];

export async function fetchUserlistPublic(id: string) {
    const params = new URLSearchParams();
    params.append("id", id);
    const profile = await axios
    .get(
        `/api/list/public${params}`,
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

export const useUserlistPublic = (id: string) => {
    return useQuery<any, Error>({
        queryKey: userlistPublicQueryKey,
        queryFn: () => fetchUserlistPublic(id),
    });
};
