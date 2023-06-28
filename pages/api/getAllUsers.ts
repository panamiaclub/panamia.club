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
const getAllUsers = async (page:number) =>{
    await dbConnect();
    const Users = await users.find().skip(page*20).limit(5);
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
  let page = 0;
  let queryVal = "";

  if(req.query.page){
    page = parseInt(req.query.page.toString());
  }

   // get all users
  try{
    console.log(page)
    var Users = await getAllUsers(page);
    //console.log(Users);
    res.status(200);//.json({ success: true, data: Users });
    res.end(JSON.stringify(Users));
  }catch(err: any){
    return res.status(400).json({ error: "Error on '/api/getAllusers': " + err })
  }
}

