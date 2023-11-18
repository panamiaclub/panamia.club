
export const standardizeDateTime = function (value: Date) {
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