// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import bcrypt from "bcrypt";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}
const getAllUsers = async () =>{
    await dbConnect();
    const Users = await users.find();
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

    // get all users
    try{
      var Users = await getAllUsers();
      res.status(200);//.json({ success: true, data: Users });
      return res.end(JSON.stringify(Users));
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getAllusers': " + err })
    }
}

