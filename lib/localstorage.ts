const key_modifier = "_pana_"

const modKey = (key: string) => {
    return `${key_modifier}${key}`;
}

const expKey = (key: string) => {
    return `${key_modifier}${key}_expires`;
}

const setExpires = (key: string, expires: number) => {
    const d = new Date();
    d.setTime(d.getTime() + (expires * 60 * 60 * 1000)); // expires should be in hours
    localStorage.setItem(expKey(key), d.valueOf().toString());
}

const hasExpired = (key: string) => {
    const expires = localStorage.getItem(expKey(key));
    if (!expires) {
        return false;
    }
    if (new Date() > new Date(parseInt(expires))) {
        return true
    }
    return false;
}

export const Local = {
    set: (key: string, value: string, expires?: number) => {
        if (typeof window == "undefined") {
            return null;
        }
        if (expires) {
            setExpires(key, expires);
        }
        return localStorage.setItem(modKey(key), value);
    },
    get: (key: string,) => {
        if (typeof window == "undefined") {
            return null;
        }
        if (hasExpired(key)) {
            localStorage.removeItem(modKey(key));
            localStorage.removeItem(expKey(key));
        }
        return localStorage.getItem(modKey(key));
    }
}