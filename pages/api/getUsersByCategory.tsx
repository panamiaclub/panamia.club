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

const getUsersByCategory = async (category: string) =>{
  await dbConnect();
  console.log(category);
  const Users = await users.find({category: category});
  return Users;
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
  let category = "";
  let queryVal = "";

  if(req.query.category){
    category = req.query.category.toString();
    try{
        var users = await getUsersByCategory(category.toString());
        return res.status(200).json({ success: true, data: users });
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getUsersByCategory': " + err })
    }
  }
  
}