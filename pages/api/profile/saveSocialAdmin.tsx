// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";
import user from "../auth/lib/model/user";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

const getProfileByEmail = async (email: string) =>{
    await dbConnect();
    const Profile = await profile.findOne({email: email});
    return Profile;
}

const getUserByEmail = async (email: string) =>{
  await dbConnect();
  const User = await user.findOne({email: email});
  return User;
}

//todo: add admin check

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ success: false,  error: "No user session available" });
  }

  //admin check
  const adminProfile = await getUserByEmail(session.user.email);
  if(!adminProfile.status?.role || adminProfile.status?.role != "admin"){
    return res.status(401).json({ success: false,  error: "No admin session available" });
  }

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }
 

  const { socials, email } = req.body;

  const existingProfile = await getProfileByEmail(email);

  if (existingProfile) {
    if (socials) {
      existingProfile.socials = socials;
    }    
    try {
      existingProfile.save()
    } catch(e) {
      if (e instanceof Error) {
        console.log(e.message);
        return res.status(500).json({ success: false, error: e.message });
      }
    }
    return res.status(200).json({ success: true, data: existingProfile })
  }
  return res.status(401).json({ success: false, error: "Could not find pofile" });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}