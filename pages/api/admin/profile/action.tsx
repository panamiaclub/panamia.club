// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "../../auth/lib/connectdb";
import profile from "../../auth/lib/model/profile";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

const getProfile = async (email: string) =>{
    await dbConnect();
    const Profile = await profile.findOne({email: email});
    return Profile;
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
  const { email, access, action } = req.body;

  if (email) {
    const emailCheck = email.toString().toLowerCase();
    const existingProfile = await getProfile(emailCheck);
    if (!existingProfile) {
        return res.status(200).json({ success: false, error: "Profile Not Found" });
    }
    if (existingProfile.status.access !== access) {
        return res.status(200).json({ success: false, error: "Invalid Access Key"  });
    }
    if (action === "approve") {
      existingProfile.active = true;
      existingProfile.status = {
          ...existingProfile.status,
          approved: new Date()
      };
      await existingProfile.save();
      // TODO: Send Approval email
      return res.status(200).json({ success: true, data: [{
          "message": "Profile has been set active",
          "name": existingProfile.name,
          "handle": existingProfile.slug,
      }] });
    }
    if (action === "decline") {
      existingProfile.active = false;
      existingProfile.status = {
        ...existingProfile.status,
        declined: new Date()
      };
      await existingProfile.save()
      // TODO: Send Decline email
      return res.status(200).json({ success: true, data: [{
          "message": "Profile has been declined",
          "name": existingProfile.name,
          "handle": existingProfile.slug,
      }] });
    }
  }
  
  return res.status(200).json({ success: false, error: "No Profile Found" });
}

export const config = {
  api: {
    responseLimit: false,
    maxDuration: 5,
  },
}