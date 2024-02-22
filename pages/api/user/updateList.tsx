// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import user from "../auth/lib/model/user";
import { unguardUser } from "@/lib/user";
import userlist from "../auth/lib/model/userlist";

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
const getUserlistById = async (id: string) =>{
  await dbConnect();
  const List = await userlist.findOne({_id: id});
  return List;
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

  const { action, list_id, profile_id, list_name } = req.body;
  if (!list_id || !action || !profile_id) {
    return res.status(200).json({ success: false, error: "Missing or invalid parameters" });
  }
  console.log("profile_id", profile_id);

  const existingUser = await getUserByEmail(email);
  if (!existingUser) {
    return res.status(200).json({ success: false, error: "Failed to find user" });
  }
  let msg = "No action";
  if (list_id == "new") {
    msg = "Creating new list";
    const newUserlist = new userlist({
      user_id: existingUser._id,
      name: list_name ? list_name : "Unnamed",
      public: false,
      profiles: [profile_id],
    });
    try {
      await newUserlist.save();
      console.log("/api/user/updateList", msg);
      return res.status(200).json({ success: true, msg: msg });
    } catch (e: any) {
      if (e instanceof Error) {
        console.log(e.message);
        return res.status(500).json({ success: false, error: e.message, msg: msg });
      }
    }
  } else {
    const existingList = await getUserlistById(list_id);
    if (existingList) {
      const profiles = existingList.profiles || [];
      const idIndex = profiles.indexOf(profile_id);
      if (action == "add") {
        if (idIndex > -1) {
          msg = "Already on list";
        } else {
          profiles.push(profile_id);
          msg = "Added to list";
          existingList.set("profiles", profiles);
        }
      }
      
      if (action == "remove") {
        if (idIndex > -1) {
          profiles.splice(idIndex, 1);
          msg = "Removed from list";
          existingList.set("profiles", profiles);  
        } else {
          msg = "Already removed from list";
        }
      }
      
      try {
        existingList.save();
        console.log("updateList:", msg);
      } catch(e) {
        if (e instanceof Error) {
          console.log(e.message);
          return res.status(500).json({ success: false, error: e.message, msg: msg });
        }
      }
      return res.status(200).json({ success: true, msg: msg });
    }
    return res.status(401).json({ success: false, error: "Could not find profile", msg: msg });
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}