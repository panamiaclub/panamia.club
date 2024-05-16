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

const getPanaByEmail = async (email: string) => {
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
  
  //Check if filename exists
  const { filename, email } = req.body;
  console.log(req.body)
  console.log('Filename: ' + filename);
  
  if (!filename) {
    return res.status(400).json({ success: false, error: "Filename not provided" });
  }

  console.log(filename);
  
  //get pana profile
  const panaProfile = await getPanaByEmail(email);
  if(!panaProfile){
    return res.status(400).json({ success: false, error: "Error Loading Pana! Please refresh and try again!" });
  }
  const panaProileDoc = new profile(panaProfile);
    
  const existingImages = panaProfile?.images;
  console.log("existingImages", existingImages);

  // Create a new object to store the filtered images
  const newImages: { [key: string]: string } = {};

 if (existingImages && typeof existingImages === 'object') {
    // Iterate over object properties
    for (const key in existingImages) {
      if (existingImages.hasOwnProperty(key)) {
        // Check if the value (filename) matches
        if (!existingImages[key].includes(filename)) {
          // If filename doesn't match, retain the image
          newImages[key] = existingImages[key];
        }
      }
    }
    
    // Update panaProfile with the filtered images
    panaProfile.images = newImages;
  } else {
    // Handle the case where existingImages is not an object
    console.error("existingImages is not an object");
    return res.status(500).json({ success: false, error: "Internal Server Error" });
 } 
  
  //delete image
  try {

    const response = await deleteFile(filename)
      .then((result) => {
        if (result) {
          console.log("File deleted successfully:", result);
        } else {
          console.log("File deletion failed.");
        }
      })
      .catch((error) => {
        console.log("Error:", error);
      });

    if(response !== null) {
      panaProfile.images = newImages;
      await panaProfile.save();
      
      console.log("File deleted successfully");
      return res.status(200).json({ success: true });
    }else{
      return res.status(500).json({ success: false, error: "Internal Server Error" });
    }

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