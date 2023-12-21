import { PronounsInterface } from "./interfaces";

export const standardizedFields = {
    "email": {
        "maxLength": 100
    },
    "phoneNumber": {
        "maxLength": 15
    },
}

export const serialize = (object: any) => {
    return  JSON.parse(JSON.stringify(object));
}

export const forceInt = (value: string | undefined, ifNaN: number) => {
    if (value === undefined) {
        return ifNaN;
    }
    if (Number.isNaN(parseInt(value))) {
        return ifNaN;
    }
    return parseInt(value);
}

export const forceString = (value: string | string[] | undefined, ifNaS: string) => {
    if (value === undefined) {
        return ifNaS;
    }
    if (!value) {
        return ifNaS;
    }
    return value.toString(); 
}

export const randomFromItem = (item: any) => {
    return item[Math.floor(Math.random()*item.length)];
}

export const generateAffiliateCode = () => {
    const charList = "123456789ABCDEFGHJKMNPQRSTUVWXYZ" // no 0, O, I, L
    let code = "";
    Array.from(Array(10)).forEach(() => {code = `${code}${randomFromItem(charList)}`});
    return code;
}

export const standardizeDateTime = function (value: Date | undefined) {
    if (value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        value = new Date(value);
    }
    if (value) {
        const options: any = {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            hour12: true,
          };
        return new Intl.DateTimeFormat(undefined, options).format(value)
    }
    return "";
}

export const splitName = function (value: string) {
    let firstName = value;
    let lastName = "";
    if (value.indexOf(" ") > 0) {
      firstName = value.split(' ').slice(0, -1).join(' ');
      lastName = value.split(' ').slice(-1).join(' ');
    }
    return [ firstName, lastName ];
}

export const displayPronouns = (pronouns: PronounsInterface | undefined) => {
    // console.log(pronouns);
    if (!pronouns) {
        return "";
    }
    let pronounArray = [];
    if (pronouns.sheher) {
        pronounArray.push("She/Her");
    }
    if (pronouns.hehim) {
        pronounArray.push("He/Him");
    }
    if (pronouns.theythem) {
        pronounArray.push("They/Them");
    }
    if (pronouns.none) {
        pronounArray.push("None");
    }
    if (pronouns.other) {
        pronounArray.push(pronouns.other_desc);
    }
    console.log("pronounArray", pronounArray);
    return pronounArray.join(",")
}

export const buildSearchData = function(...args: any[]) {
    return args.reduce( (accu, current) => { `${accu} | ${current}`});
}

export const debounce = (func: Function, wait = 500) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return function (this: any, ...args: any[]) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), wait);
    };
};

export const slugify = (value: string) => {
    return value.normalize('NFD')
        .replace("&", "and")
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, '-');
}

export const truncateWithEllipsis = (value: string) => {

}