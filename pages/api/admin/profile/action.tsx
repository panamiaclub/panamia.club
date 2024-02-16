// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "../../auth/lib/connectdb";
import profile from "../../auth/lib/model/profile";
import BrevoApi from "@/lib/brevo_api";
import { getBrevoConfig } from "@/config/brevo";

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
  let totalProfiles = 0;
  try {
    totalProfiles = await profile.countDocuments({active: true});
  } catch (e: any) {
    console.log("profile.countDocuments failed", e)
  }
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
      const brevo = new BrevoApi();
      const brevo_config = getBrevoConfig();
      if (brevo_config.templates.profile.published) {
        const params = {
          name: existingProfile.name,
        }
        const response = await brevo.sendTemplateEmail( brevo_config.templates.profile.published, params, existingProfile.email );
      }
      return res.status(200).json({ success: true, data: [{
          "message": "Profile has been set active",
          "name": existingProfile.name,
          "handle": existingProfile.slug,
          "total": totalProfiles,
      }] });
    }
    if (action === "decline") {
      existingProfile.active = false;
      existingProfile.status = {
        ...existingProfile.status,
        declined: new Date()
      };
      await existingProfile.save();
      const brevo = new BrevoApi();
      const brevo_config = getBrevoConfig();
      if (brevo_config.templates.profile.not_published) {
        const params = {
          name: existingProfile.name,
        }
        const response = await brevo.sendTemplateEmail( brevo_config.templates.profile.not_published, params, existingProfile.email );
      }
      return res.status(200).json({ success: true, data: [{
          "message": "Profile has been declined",
          "name": existingProfile.name,
          "handle": existingProfile.slug,
          "total": totalProfiles,
      }] });
    }
  }
  
  return res.status(200).json({ success: false, error: `No Profile Found` });
}

export const config = {
  api: {
    responseLimit: false,
    maxDuration: 5,
  },
}