// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import busboy from "busboy";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";
import user from "../auth/lib/model/user";
import { deleteFile, uploadFile } from "@/lib/bunnycdn/api";

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

const getUserByEmail = async (email: string) =>{
  await dbConnect();
  const User = await user.findOne({email: email});
  return User;
}

const cacheRand = () => {
 return (Math.floor((Math.random() + 1) * 10000)).toString().substring(1,4)
}

const processFile = async (existingProfile: any, file: { data: Buffer, filename: string, fieldname: string, ext: string}) => {
  const filePath  = await uploadFile(file.filename, file.data)
  if (!filePath) {
    return false;
  }
  console.log("filePath", filePath);
  const existingImage = existingProfile?.images?.[file.fieldname];
  // console.log("existingImage", existingImage);
  if (existingImage &&  existingImage !== file.filename) {
      await deleteFile(existingImage);
    }
    // console.log("pre-update", file.fieldname, existingProfile.images);
    existingProfile.images = {
      ...existingProfile.images,
      ...{ [file.fieldname]: file.filename},
      ...{ [file.fieldname + "CDN"]: filePath},
    }
    // console.log("post-update", file.fieldname, existingProfile.images);
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
  //const email = session.user?.email;
  const email = req.headers.email?.toString();
  console.log(email);
 
  if (!email) {
    console.log('no email')
    return res
      .status(200)
      .json({ success: false, error: "No valid email" });
  }

  //admin check
  const adminProfile = await getUserByEmail(session.user.email);
  if(!adminProfile.status?.role || adminProfile.status?.role != "admin"){
    return res.status(401).json({ success: false,  error: "No admin session available" });
  }
  
  const existingProfile = await getProfileByEmail(email);
  const handle = existingProfile.slug;


  const { filename } = req.body;
  deleteFile(filename);


  if (existingProfile) {
    console.log("return response");
    // return res.status(200).json({ success: true, data: existingProfile })
  }

  // return res.status(401).json({ success: false, error: "Could not find pofile" });
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '15mb',
  },
}