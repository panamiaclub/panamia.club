// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import user from "../auth/lib/model/user";
import { unguardUser } from "@/lib/user";
import profile from "../auth/lib/model/profile";
import { unguardProfile } from "@/lib/profile";
import userlist from "../auth/lib/model/userlist";

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
const getUserlistsByUserId = async (id: string) =>{
  await dbConnect();
  const List = await userlist.find({user_id: id});
  return List;
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
    if (req.method !== "GET") {
      return res
        .status(200)
        .json({ success: false,  error: "This API call only accepts GET methods" });
    }
    const email = session.user?.email;
    if (!email) {
      return res
        .status(200)
        .json({ success: false, error: "No valid email" });
    }

    const existingUser = await getUserByEmail(email);
    const existingLists = await getUserlistsByUserId(existingUser._id);
    if (existingLists) {
        return res.status(200).json({ success: true, data: existingLists });
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