// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import followers from "./auth/lib/model/followers";
import bcrypt from "bcrypt";

interface ResponseData {
  error?: string;
  msg?: string;
}


const validateForm = async (
  followerId: string,
  userId:string 
) => {
  //await dbConnect();
  const alreadyFollowing = await followers.findOne({followerId:followerId, userId:userId});
  if (alreadyFollowing) {
    return { error: "Already following." };
  }
  return null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // validate if it is a POST
  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ error: "This API call only accepts PUT methods" });
  }

  // get and validate body variables
  const { followerId, followerUserName, followedUserName, userId } = req.body;


  const errorMessage = await validateForm(followerId, userId);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }
  
  //console.log(followerUserName)

    // create new follower on MongoDB
    const newFollower = new followers({
        followerId: followerId,
        followerUserName: followerUserName,
        followedUserName: followedUserName,
        userId: userId
      });

    //console.log(newFollower);
    //console.log(userId);

    newFollower
      .save()
      .then(() =>{
        console.log('success');
        res.status(200).json({ msg: "Successfully followed: " + userId })
      })
      .catch((err: string) =>
        res.status(400).json({ error: "Error on '/api/addFollower': " + err })
      );
    }
  

