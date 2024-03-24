// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import busboy from "busboy";

import { authOptions } from "../../auth/[...nextauth]";
import dbConnect from "../../auth/lib/connectdb";
import profile from "../../auth/lib/model/profile";
import user from "../../auth/lib/model/user";
import { deleteFile, uploadFile } from "@/lib/bunnycdn/api";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
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
      .status(405)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }
 
  //admin check
  const adminProfile = await getUserByEmail(session.user.email);
  if(!adminProfile.status?.role || adminProfile.status?.role != "admin"){
    console.log('no admin session');
    return res.status(401).json({ success: false,  error: "No admin session available" });
  }

  const { filename } = req.body;
  console.log(req.body)
  console.log('Filename: ' + filename);

   // Check if filename exists
   if (!filename) {
    return res.status(400).json({ success: false, error: "Filename not provided" });
  }
  
  try {
    await deleteFile(filename);
    console.log("File deleted successfully");
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}