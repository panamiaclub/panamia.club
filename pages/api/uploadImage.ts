// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import images from "./auth/lib/model/images";
import users from "./auth/lib/model/users"
import bcrypt from "bcrypt";
import { ObjectId } from "mongoose";

interface ResponseData {
  error?: string;
  msg?: string;
}


const validateForm = async (
  id: string,
  uploadImages: string 
) => {
  if(uploadImages){
    //console.log('images'+uploadImages);
  }
  //const User = await users.findById({_id: id});
  //if(!User){
      //return "error user not found";
  //}
  await dbConnect();

  return null;
};


export const config = {
  api: {
    responseLimit: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  console.log(req.body.userId)
  // validate if it is a POST
  if (req.method !== "PUT") {
    return res
      .status(200)
      .json({ error: "This API call only accepts PUT methods" });
  }

  // get and validate body variables
  const { userId, item } = req.body;

  const errorMessage = await validateForm(userId, item);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }
  
let statuss = "";

    const newImage = new images({
      image: item,
      userId: userId
    });
   
    await newImage.save()
        .then(() =>{
          res.status(200).json({ msg: "Successfuly added image"})
        })
          .catch((err: string) => {
            res.status(400).json({ error: "Error on '/api/uploadImage': " + err })
          });
}
  
