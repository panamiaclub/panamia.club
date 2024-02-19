import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface SearchInterface {
    pageNum: number,
    pageLimit: number,
    searchTerm: string,
    filterLocations: string,
    filterCategories: string,
    random: number,
    geolat: number,
    geolng: number
}

export interface SearchResultsInterface {
    _id: String,
    score: number,
    score_details: {},
    name: String,
    slug: String,
    details: String,
    five_words: String,
    geo: {
        coordinates?: Array<2>
    },
    images: {
        primaryCDN: string,
    }
    primary_address?: { city?: String },
    socials: {},
<<<<<<< HEAD
    active: Boolean,
    tags: String,
    whatsapp_community: String,
    email: String
=======
    meta: any,
    paginationToken: any,
>>>>>>> a6bf0814748a374d8471803d687d5c91e903aa8e
}

export const searchParamsToString = (params: SearchInterface) => {
    const qs = new URLSearchParams();
    qs.append("q", params.searchTerm);
    if (params.pageNum > 1) {
        qs.append("page", params.pageNum.toString())
    }
    if (params.pageLimit !== 20) {
        qs.append("limit", params.pageLimit.toString())
    }
    return `${qs}`
}

export const directorySearchKey = 'directorySearch';

export async function fetchSearch(query: SearchInterface) {
    console.log("fetchSearch");
    const response = await axios
    .get(
        `/api/getDirectorySearch?${searchParamsToString(query)}`,
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
    if (response) {
        
        return response.data.data;
    }
    console.log("NO RESPONSE")
    return { data: { message: ""}};
}

export const useSearch = (filters: SearchInterface) => {
    return useQuery<SearchResultsInterface[], Error>({
        queryKey: [directorySearchKey, filters],
        queryFn: () => fetchSearch(filters),
    });
};

