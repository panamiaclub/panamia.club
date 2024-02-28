// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";
import { unguardProfile } from "@/lib/profile";
import userlist from "../auth/lib/model/userlist";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[] | any;
}
const getUserlist = async (id: string) =>{
    await dbConnect();
    const Profile = await userlist.findOne({_id: id});
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
    const existingUserlist = await getUserlist(handle);
    if (existingUserlist) {
      // TODO: Create SAFE profile object for Public API
      return res.status(200).json({ success: true, data: existingUserlist });
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