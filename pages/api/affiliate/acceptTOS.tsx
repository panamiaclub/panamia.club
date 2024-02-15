// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import user from "../auth/lib/model/user";
import { unguardUser } from "@/lib/user";
import BrevoApi from "@/lib/brevo_api";
import { getBrevoConfig } from "@/config/brevo";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[] | any;
}

const getUserByEmail = async (email: string) =>{
    await dbConnect();
    return await user.findOne({email: email});
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  try {
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

    const { accept_tos } = req.body;
    console.log("accept_tos", accept_tos)

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      if (existingUser?.affiliate?.accepted_tos) {
          return res
              .status(200)
              .json({ success: false, error: "You've already accepted the Affiliate Terms of Service" });
      }
      if (accept_tos) {
          const affiliate = {
              ...existingUser.affiliate
          };
          affiliate.accepted_tos = new Date();
          affiliate.activated = true;
          existingUser.affiliate = affiliate;
          try {
              await existingUser.save();
              console.log("existingUser.affilate", existingUser.affiliate);
          } catch(e) {
            if (e instanceof Error) {
              console.log(e.message);
              return res.status(500).json({ success: false, error: e.message });
            }
          }
      }
      // send Brevo template email
      const brevo = new BrevoApi();
      const brevo_config = getBrevoConfig()
      const template_id = brevo_config.templates.admin.affiliate_submission;
      if (template_id) {
        const params = {
          name: existingUser.name,
          email: existingUser.email,
          affiliate: existingUser?.affiliate?.code ? existingUser.affiliate?.code : "n/a",
        }
        const response = await brevo.sendTemplateEmail( template_id, params);
        console.log("response", response);
      }
      // TODO: Send Brevo email
      return res.status(200).json({ success: true, data: unguardUser(existingUser) });
    }
    return res.status(401).json({ success: false, error: "Could not find User" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false,  error: `Server Error ${error}` });
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}