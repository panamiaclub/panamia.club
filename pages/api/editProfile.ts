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
  username: string,
  email: string,
  bio: string, 
  instagram: string,
  twitter: string,
  link1: string,
  link2: string,
  category: string,
  avatar: string,
  location: string
  //images: []
) => {
  if (username.length < 3) {
    return { error: "Username must have 3 or more characters" };
  }
  if (!validateEmail(email)) {
    return { error: "Email is invalid" };
  }
  if(bio){
    //console.log(bio);
  }

  if(avatar){
    //console.log('avatar'+avatar);
  }
  if(category){
    console.log(category);
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
  const { username, email, bio, instagram, twitter, link1, link2, category, avatar, featured, location } = req.body;

  const errorMessage = await validateForm(username, email, bio, instagram, twitter, link1, link2, category, avatar, location);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }

      // create new User on MongoDB
    const newUser = {
        username: username,
        email: email,
        bio: bio,
        instagramHandle: instagram,
        twitterHandle: twitter,
        link1: link1,
        link2: link2,
        category: category, 
        avatar: avatar,
        featured: featured,
        location: location
        //images: images
      };
console.log(email);

      await users.findOneAndUpdate({ email: email }, {$set: newUser}, {returnNewDocument: true})
      .then(() =>{
          console.log('success');
          res.status(200).json({ msg: "Successfuly edited profile " + newUser })
      })
        .catch((err: string) =>
        res.status(400).json({ error: "Error on '/api/editProfile': " + err })
        );


    }
  

