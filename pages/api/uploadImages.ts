// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import bcrypt from "bcrypt";

interface ResponseData {
  error?: string;
  msg?: string;
}

const validateEmail = (email: string): boolean => {
  const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return regEx.test(email);
};

const validateForm = async (
  email: string,
  uploadImages: [], 
) => {
  if (!validateEmail(email)) {
    return { error: "Email is invalid" };
  }
  if(uploadImages){
    console.log('featured'+uploadImages);
   
  }
  const emailUser = await users.findOne({ email: email });

  await dbConnect();

  return null;
};

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
  const { email, uploadImages } = req.body;

  const errorMessage = await validateForm(email, uploadImages);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }

    // create new User on MongoDB
    const newUser = {
        email: email,
        images: uploadImages
      };
      console.log(email);
      console.log(uploadImages);

      await users.findOneAndUpdate({ email: email }, {$push: {images:uploadImages}}, {returnNewDocument: true})
      .then(() =>{
          console.log('success');
          res.status(200).json({ msg: "Successfuly added user "+ {email}+" images"})
      })
        .catch((err: string) =>
        res.status(400).json({ error: "Error on '/api/editFeature': " + err })
        );


    }
  
    export const config = {
      api: {
        bodyParser: {
          sizeLimit: '5mb',
        },
      },
    }

