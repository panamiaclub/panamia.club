// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import user from "../auth/lib/model/user";
import { unguardUser } from "@/lib/user";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[] | any;
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

  const { action, id } = req.body;
  console.log("id", id);

  const existingUser = await getUserByEmail(email);
  let msg = "No action";
  if (existingUser) {
    const following = existingUser.following || [];
    const idIndex = following.indexOf(id);
    if (action == "follow") {
      if (idIndex > -1) {
        msg = "Already following";
      } else {
        following.push(id);
        msg = "Followed";
        existingUser.set("following", following);  
      }
    }
    
    if (action == "unfollow") {
      if (idIndex > -1) {
        following.splice(idIndex, 1);
        msg = "Unfollowed";
        existingUser.set("following", following);  
      } else {
        msg = "Already unfollowed";
      }
    }
    
    try {
      existingUser.save();
      console.log("updateFollowing:", msg);
    } catch(e) {
      if (e instanceof Error) {
        console.log(e.message);
        return res.status(500).json({ success: false, error: e.message, msg: msg });
      }
    }
    return res.status(200).json({ success: true, data: unguardUser(existingUser), msg: msg });
  }
  return res.status(401).json({ success: false, error: "Could not find pofile", msg: msg });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}