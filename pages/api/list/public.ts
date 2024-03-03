// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "../auth/lib/connectdb";
import userlist from "../auth/lib/model/userlist";
import profile from "../auth/lib/model/profile";
import { unguardProfile } from "@/lib/profile";

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

  if (req.query.id) {
    const list_id = req.query.id.toString();
    const existingUserlist = await getUserlist(list_id);
    console.log("existingUserlist", existingUserlist)
    if (existingUserlist) {
      // TODO: Create SAFE profile object for Public API
      if (existingUserlist?.profiles.length > 0) {
        const listProfiles = await profile.find({ '_id': { $in: existingUserlist.profiles } });
        const profiles = listProfiles.map((guardedProfile) => {
          return unguardProfile(guardedProfile);
        });
        if (listProfiles) {
          return res.status(200).json({ success: true, data: {list: existingUserlist, profiles: profiles} });
        }
      }
      return res.status(200).json({ success: true, data: {list: existingUserlist, profiles: []} });
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