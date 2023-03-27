// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import bcrypt from "bcrypt";

interface ResponseData {
  error?: string;
  msg?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  console.log(req.body)
  // validate if it is a POST
  if (req.method !== "PUT") {
    return res
      .status(200)
      .json({ error: "This API call only accepts PUT methods" });
  }

  // get and validate body variables
  const { email} = req.body;

    // create new User on MongoDB
   
      console.log(email);

      await users.findOneAndUpdate({ email: email }, {$set: {onboardingFormComplete:true}}, {returnNewDocument: true})
      .then(() =>{
          console.log('success');
          res.status(200).json({ msg: "Successfuly edited user "+ {email}+" to onboardingformcomplete: " + true })
      })
        .catch((err: string) =>
        res.status(400).json({ error: "Error on '/api/editFeature': " + err })
        );


    }
  

