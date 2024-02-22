import axios from "axios";
import { useQuery } from "@tanstack/react-query";

import { ProfileInterface } from "@/lib/interfaces";

export const profilesQueryKey = ['profiles'];

export interface AdminProfileInterface {
    name: string,
    email: string,
    handle: string,
    phone: string,
}

export interface AdminSearchInterface {
    pageNum: number,
    pageLimit: number,
    searchTerm: string,
}

export interface AdminSearchResultsInterface {
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
    meta: any,
    paginationToken: any,
}

export interface AdminDashboardInterface {
    all: number,
    recent: ProfileInterface[],
}

export const adminSearchKey = 'directoryAdminSearch';
export const adminDashboardKey = 'adminDashboard';

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
    return { data: { message: "" } };
}

export const useAdminActiveProfiles = () => {
    return useQuery<AdminProfileInterface[], Error>({
        queryKey: profilesQueryKey,
        queryFn: () => fetchAdminActiveProfiles(),
    });
};

export const searchParamsToString = (params: AdminSearchInterface) => {
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

export async function fetchAdminSearch(query: AdminSearchInterface) {
    console.log("fetchSearch");
    const response = await axios
        .get(
            `/api/admin/getDirectorySearch?${searchParamsToString(query)}`,
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
    return { data: { message: "" } };
}

export const useAdminSearch = (filters: AdminSearchInterface) => {
    return useQuery<AdminSearchResultsInterface[], Error>({
        queryKey: [adminSearchKey, filters],
        queryFn: () => fetchAdminSearch(filters),
    });
};

export async function fetchAdminDashboard() {
    console.log("fetchSearch");
    const response = await axios
        .get(
            `/api/admin/getDashboard`,
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
    return { data: { message: "" } };
}

export const useAdminDashboard = () => {
    return useQuery<AdminDashboardInterface, Error>({
        queryKey: [adminDashboardKey],
        queryFn: () => fetchAdminDashboard(),
    });
};



