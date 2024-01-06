// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth/[...nextauth]";

import dbConnect from "./auth/lib/connectdb";
import profile from "./auth/lib/model/profile";

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
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "No user session available" });
  }

  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }
  const email = session.user?.email ? (session.user?.email as string).toLowerCase() : null;
  if (!email) {
    return res
      .status(200)
      .json({ error: "No logged in user" });
  }
  const existingProfile = await getProfile(email);
  if (existingProfile) {
    return res.status(200).json({ success: true, data: existingProfile });
  }
  return res.status(200).json({ success: true });
}

export const config = {
  api: {
    responseLimit: false,
    maxDuration: 5,
  },
}