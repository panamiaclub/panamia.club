// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import profile from "./auth/lib/model/profile";
import bcrypt from "bcrypt";

interface ResponseData {
  error?: string;
  msg?: string;
}

const validateForm = async (
  email: string,
  active: string, 
) => {
  // if (!validateEmail(email)) {
  //   return { error: "Email is invalid" };
  // }
  if(active){
    console.log('active: '+ active);
   
  }
  //await dbConnect();
  //const emailUser = await users.findOne({ email: email });
  return null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  
  // validate if it is a POST
  if (req.method !== "PUT") {
    return res
      .status(200)
      .json({ error: "This API call only accepts PUT methods" });
  }

  // get and validate body variables
  const {id, active} = req.body;
  console.log(req.body)
  console.log(id);
  console.log(active);

  const errorMessage = await validateForm(id, active);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }

    // create new User on MongoDB
    await profile.findOneAndUpdate({ id: id }, {$set: {featured:active}})
    .then(() =>{
        console.log('success');
        res.status(200).json({ msg: "Successfuly updated user " + id.toString() + " active status to: " + active })
    })
      .catch((err: string) =>
      res.status(400).json({ error: "Error on '/api/editFeature': " + err })
      );

    }
  

