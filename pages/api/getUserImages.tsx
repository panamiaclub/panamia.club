// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import image from "./auth/lib/model/images";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}
const getUserImages = async (id: string) =>{
    await dbConnect();
    //console.log(id);
    const Images = await image.find({userId: id});
    return Images;
}


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  let userId = "";
  if(req.query.userId){
    userId = req.query.userId.toString();
    console.log(userId);
  }

  // validate if it is a GET
  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }

    // get Invoice
    try{
      if(userId){
        //console.log(userId);
        var images = await getUserImages(userId);
        //console.log('email');
        //console.log(images);
        return res.status(200).json({ success: true, data: images });
      }
       
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getUserImages': " + err })
    }
}