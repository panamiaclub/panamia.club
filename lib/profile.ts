import { profileCategoryList } from "@/lib/lists";
import { CategoryInterface } from "./interfaces";

export const listSelectedCategories = (categories: CategoryInterface) => {
    let listText = "";
    type keyType = keyof CategoryInterface; //  "name" | "age"
    Object.keys(categories).forEach((key) => {
        const listObj = profileCategoryList.find((obj) => {
            return obj.value == key;
        });
        if (listObj) {
            listText = listText.length === 0 ? listObj.desc : `${listText}, ${listObj.desc}`;
        }
    });
    return listText;
}

export const unguardProfile = (profile: any) => {
    // only send safe for public fields
    return {
        ...profile.slug,
        ...profile.name,
        ...profile.details,
        ...profile.background,
        ...profile.socials,
        ...profile.five_words,
        ...profile.socials,
        ...profile.tags,
        ...profile.categories,
        ...profile.primary_address,
        ...profile.counties,
        ...profile.geo,
        ...profile.images,
        ...profile.linked_profiles,
    }
}