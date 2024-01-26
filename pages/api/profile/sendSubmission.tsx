// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";
import BrevoApi from "@/lib/brevo_api";

import { getBrevoConfig } from "@/config/brevo";

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

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }
  const { email } = req.body;
  if (!email) {
    return res
      .status(200)
      .json({ success: false, error: "No valid email" });
  }


  const existingProfile = await getProfileByEmail(email);
  const brevo_config = getBrevoConfig()
  const template_id = brevo_config.templates.admin.profile_submission;
  if (template_id === 0) {
    return res.status(200).json({ success: false, error: "No Template ID" });
  }
  if (existingProfile) {
    if (existingProfile.active === false) {
        // send Brevo template email
        const brevo = new BrevoApi();
        const brevo_config = getBrevoConfig()
        const template_id = brevo_config.templates.admin.profile_submission;
        const accessKey = existingProfile?.status?.access;
        const base_action_url = "https://www.panamia.club/admin/profile/action"
        const approve_url = new URL(`${base_action_url}`)
        approve_url.searchParams.set("email", existingProfile.email);
        approve_url.searchParams.set("access", accessKey);
        approve_url.searchParams.set("action", "approve");

        const decline_url = new URL(`${base_action_url}`)
        decline_url.searchParams.set("email", existingProfile.email);
        decline_url.searchParams.set("access", accessKey);
        decline_url.searchParams.set("action", "decline");
        if (template_id) {
          const params = {
            name: existingProfile.name,
            email: existingProfile.email,
            details: existingProfile.details,
            phone_number: existingProfile.phone_number,
            five_words: existingProfile.five_words,
            tags: existingProfile.tags,
            socials_website: existingProfile?.socials?.website ? existingProfile.socials.website : "n/a",
            socials_instagram: existingProfile?.socials?.instagram ? existingProfile.socials.instagram : "n/a",
            socials_facebook: existingProfile?.socials?.facebook ? existingProfile.socials.facebook : "n/a",
            socials_tiktok: existingProfile?.socials?.tiktok ? existingProfile.socials.tiktok : "n/a",
            socials_twitter: existingProfile?.socials?.twitter ? existingProfile.socials.twitter : "n/a",
            socials_spotify: existingProfile?.socials?.spotify ? existingProfile.socials.spotify : "n/a",
            hearaboutus: existingProfile.hearaboutus,
            affiliate: existingProfile?.affiliate ? existingProfile.affiliate : "n/a",
            approve_url: approve_url.toString(),
            decline_url: decline_url.toString(),
          }

          const response = await brevo.sendTemplateEmail(
            brevo_config.templates.admin.profile_submission,
            params,
            );
          console.log("response", response);
          // TODO: Confirm 201 response from Brevo
        }
        return res.status(200).json({ success: true, data: [] });
    }
    return res.status(200).json({ success: false, error: "Profile already active" });
  }
  return res.status(401).json({ success: false, error: "Could not find pofile" });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}