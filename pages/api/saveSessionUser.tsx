// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { authOptions } from "./auth/[...nextauth]";

import dbConnect from "./auth/lib/connectdb";
import user from "./auth/lib/model/user";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

const getUserByEmail = async (email: string) =>{
    await dbConnect();
    const User = await user.findOne({email: email});
    return User;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: "No user session available" });
  }

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ error: "This API call only accepts POST methods" });
  }
  const email = session.user?.email;
  // console.log("email", `'${email}'`);
  const { name, zip_code } = req.body;
  // console.log("zip_code", zip_code);
  if (!email) {
    return res
      .status(200)
      .json({ error: "Email value required" });
  }
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    // console.log("saveSessionUser:existingUser", existingUser);
    if (name) {
      existingUser.name = name
    }
    if (zip_code) {
      existingUser.zip_code = zip_code
    }
    existingUser.save()
    return res.status(200).json({ success: true, data: existingUser })
  }
  return res.status(401).json({ success: true, error: "Could not find user" });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}