// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ success: false,  error: "No user session available" });
  }

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }
  const email = session.user?.email;
  if (!email) {
    return res
      .status(200)
      .json({ success: false, error: "No valid email" });
  }

  const { primary_address, counties } = req.body;

  const existingProfile = await getProfileByEmail(email);
  if (existingProfile) {
    existingProfile.primary_address = primary_address;
    existingProfile.counties = counties;
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