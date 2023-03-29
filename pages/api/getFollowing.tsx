// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import followers from "./auth/lib/model/followers";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

const getFollowers = async (userId: string) =>{
  await dbConnect();
  console.log(userId);
  

  const Followers = await followers.aggregate([{
    $lookup:{
      from: 'users',
      localField: 'followerId', 
      foreignField: 'id',
      as: 'user'
    }
  }]);

  if(Followers){
    console.log(Followers)
  }
  
  return Followers;
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
  let userId = "";

  if(req.query.userId){
    userId = req.query.userId.toString();
    console.log(userId);
    try{
        var Followers = await getFollowers(userId.toString());
        res.status(200);//.json({ success: true, data: users });
        return res.end(JSON.stringify(Followers));
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getFollowers': " + err })
    }
  }
  
}
