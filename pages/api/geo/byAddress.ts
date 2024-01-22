// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ error: "This API call only accepts POST methods" });
  }

  const { address } = req.body;

  const a = address;
  const addressLine = `${a.street1} ${a.street2} ${a.city}, ${a.state} ${a.zipcode}`;
  const apikey = process.env.POSITIONSTACK_APIKEY;
  const url = `http://api.positionstack.com/v1/forward?access_key=${apikey}&query=${addressLine}`;
  // const url = `https://geocode.maps.co/search?q=${address}&api_key=${process.env.GEOCODING_API_KEY}`;
  const psResponse = await fetch(url);

  if (!psResponse.ok) {
    return res.status(200).json({ success: false, error: "We couldn't get your GeoLocation, check your address and try again" });
  }

  const georesponse = await psResponse.json();
  const geodata = georesponse.data as Array<any>;
  // console.log(geodata);
  if (geodata.length == 0) {
    return res.status(200).json({ success: false, error: "We couldn't find results for the address you entered" });
  }
  const firstAddress = geodata[0];
  if (firstAddress?.latitude && firstAddress.longitude) {
    const geoData = [{
      "lat": firstAddress.latitude,
      "lng": firstAddress.longitude,
    }]
    return res.status(200).json({ success: true, data: geoData });
  }
  
  return res.status(200).json({ success: false, error: "We couldn't find results for the address you entered [2]" });
}

export const config = {
  api: {
    responseLimit: false,
    maxDuration: 5,
  },
}