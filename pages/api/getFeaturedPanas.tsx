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

const getFeaturedPanas = async () =>{
  await dbConnect();
  
  const Users = await users.find({featured: true}).limit(20);
  if(Users){
    //console.log(Users)
  }
  return Users;
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

    try{
        var users = await getFeaturedPanas();
        res.status(200);//.json({ success: true, data: users });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'max-age=180000');
        return res.end(JSON.stringify(users));
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getUsersByCategory': " + err })
    }
  
}
