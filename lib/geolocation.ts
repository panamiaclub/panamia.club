export const getGeoPosition = (): Promise<any> => {
    const options = {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
    } as PositionOptions;
    return new Promise((resolve, reject) => 
        {
            if (!("geolocation" in navigator)) {
                reject();
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, options)
        }
    );
}