// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";
import { unguardProfile } from "@/lib/profile";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[] | any;
}
const getProfile = async (slug: string) =>{
    await dbConnect();
    const Profile = await profile.findOne({slug: slug});
    return Profile;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }

  if (req.query.handle) {
    const handle = req.query.handle.toString().toLowerCase();
    const existingProfile = await getProfile(handle);
    if (existingProfile) {
      // TODO: Create SAFE profile object for Public API
      return res.status(200).json({ success: true, data: unguardProfile(existingProfile) });
    }
  }
  
  return res.status(200).json({ success: true });
}

export const config = {
  api: {
    responseLimit: false,
    maxDuration: 5,
  },
}