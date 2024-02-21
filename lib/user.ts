import axios from "axios";

export const getUserSession = async (host?: String) => {
    const path = "/api/getSessionUser"
    if (process.env.HOST_URL == "http://localhost:3000") {
        host = "http://localhost:3000"
    }
    const url = (host) ? `${host}${path}`: path;
    const userSession = await axios
        .get(
            url,
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        )
        .catch((error: Error) => {
            console.log(error.name, error.message, error.cause);
            return null;
        });
    if (userSession) {
        return userSession.data.data
    }
    return null;
}

export const saveUserSession = async (data: {}, host?: String) => {
    const path = "/api/saveSessionUser"
    const url = (host) ? `${host}${path}`: path;
    const userSession = await axios
        .post(
            url,
            data,
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        )
        .catch((error) => {
            console.log(error);
            return null;
        });
    if (userSession) {
        return userSession.data?.data
    }
    return null;
}

export const unguardUser = (user: any) => {
    // only send safe for public fields
    return {
        ...{email: user.email},
        ...{name: user.name},
        ...{status: {
            ...{role: user?.status?.role}
        }},
        ...{affiliate: user.affiliate},
        ...{zip_code: user.zip_code},
        ...{following: user.following},
    }
}