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
        ...{_id: profile._id},
        ...{slug: profile.slug},
        ...{name: profile.name},
        ...{details: profile.details},
        ...{background: profile.background},
        ...{socials: profile.socials},
        ...{five_words: profile.five_words},
        ...{tags: profile.tags},
        ...{categories: profile.categories},
        ...{primary_address: profile.primary_address},
        ...{counties: profile.counties},
        ...{geo: profile.geo},
        ...{images: profile.images},
        ...{linked_profiles: profile.linked_profiles},
    }
}