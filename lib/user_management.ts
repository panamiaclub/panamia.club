import axios from "axios";



export const getUserSession = async (host?: String) => {
    const path = "/api/getSessionUser"
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
        .catch((error) => {
            console.log(error);
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