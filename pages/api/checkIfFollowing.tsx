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

const getFollowers = async (userId: string, followerId:string) =>{
  await dbConnect();
  //console.log('get follower status')
  //console.log(userId);
  //console.log(followerId);
  const Followers = await followers.findOne({followerId: followerId, userId: userId})
  //onsole.log(Followers);
  //console.log('followers^')
  if(Followers){
    return true;
  }else{
    return false;
  }
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
  let followerId = "";

  if(req.query.followerId && req.query.userId){
    userId = req.query.userId.toString();
    followerId = req.query.followerId.toString();
    console.log(userId);
    try{
        var Followers = await getFollowers(userId,followerId);
        res.status(200);//.json({ success: true, data: users });
        return res.end(JSON.stringify(Followers));
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getFollowers': " + err })
    }
  }
  
}
