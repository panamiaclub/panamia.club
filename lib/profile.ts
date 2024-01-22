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