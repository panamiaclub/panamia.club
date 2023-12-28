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

export const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const radius = 6371; // km
    const kmToMiles = 0.6213712;
    const deltaLat = (lat2 - lat1) * Math.PI / 180;
    const deltaLng = (lng2 - lng1) * Math.PI / 180;

    const halfChordLength = Math.cos(
        lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) 
        * Math.sin(deltaLng/2) * Math.sin(deltaLng/2)
        + Math.sin(deltaLat/2) * Math.sin(deltaLat/2);

    const angularDistance = 2 * Math.atan2(Math.sqrt(halfChordLength), Math.sqrt(1 - halfChordLength));

    return radius * angularDistance * kmToMiles;
}