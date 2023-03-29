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
  follow: string, 
) => {
  // if (!validateEmail(email)) {
  //   return { error: "Email is invalid" };
  // }
  if(follow){
    console.log('featured'+follow);
   
  }
  //await dbConnect();
  //const emailUser = await users.findOne({ email: email });

  return null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  console.log(req.body)
  // validate if it is a POST
  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ error: "This API call only accepts PUT methods" });
  }

  // get and validate body variables
  const { followerId, userId } = req.body;


    // create new User on MongoDB
    const newFollower = {
        followerId: followerId,
        userId: userId
      };
      console.log(followerId);
      console.log(userId);
      await followers.findOneAndDelete({ followerId: followerId, userId: userId })
      .then(() =>{
          console.log('success');
          res.status(200).json({ msg: "Successfuly unfollowed: " + userId })
      })
        .catch((err: string) =>
        res.status(400).json({ error: "Error on '/api/removeFollower': " + err })
        );


    }
  

