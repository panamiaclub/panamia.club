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
const getUser = async (email: string) =>{
    await dbConnect();
    //console.log(email);
    const User = await users.findById({email: email});
    return User;
}


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  let Email = "";
  if(req.query.email){
    Email = req.query.email.toString();
  }

  // validate if it is a GET
  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }

    // get Invoice
    try{
      if(Email){
        //console.log(id);
        var user = await getUser(Email.toString());
        //console.log('email');
        //console.log(email);
        return res.status(200).json({ success: true, data: user });
      }
       
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getUser': " + err })
    }
}