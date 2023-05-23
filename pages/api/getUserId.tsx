// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}
const getUserByEmail = async (email: string) =>{
    await dbConnect();
    //console.log(email);
    const User = await users.findOne({email: email});
    return User;
}


export const config = {
  api: {
    responseLimit: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  // validate if it is a GET
  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }
  let username = "";
  let Email = "";
  let queryVal = "";

  if(req.query.userEmail){
    Email = req.query.userEmail.toString();
    try{
        var user = await getUserByEmail(Email.toString());
        return res.status(200).json({ success: true, data: user._id.toString() });
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getUserId': " + err })
    }
  }
  
}
