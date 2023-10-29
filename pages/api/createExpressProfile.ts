// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import profile from "./auth/lib/model/profile";

interface ResponseData {
  error?: string;
  msg?: string;
}

const validateEmail = (email: string): boolean => {
  const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return regEx.test(email);
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  // validate if it is a POST
  if (req.method !== "POST") {
    return res
      .status(400)
      .json({ error: "This API call only accepts POST methods" });
  }

  // get and validate body variables
  const {
    name,
    email,
    locallyBased,
    details,
    background,
    socials,
    phone_number,
    pronouns,
    five_words,
    tags
    } = req.body;

  await dbConnect();
  const existingProfile = await profile.findOne({ email: email });
  if(existingProfile){
    return res
      .status(200)
      .json({ error: "This email is already being used for a profile." });
  }

  if (!validateEmail(email)) {
    return res
      .status(200)
      .json({ error: "Please enter a valid email address." });
  }

  const newProfile = new profile({
      name: name,
      email: email,
      locally_based: locallyBased,
      details: details,
      background: background,
      socials: socials,
      phone_number: phone_number,
      pronouns: pronouns,
      five_words: five_words,
      tags: tags
  });

  newProfile
    .save()
    .then(() =>
      res.status(200).json({ msg: "Successfuly created new profile: " + newProfile })
    )
    .catch((err: string) =>
      res.status(400).json({ error: "Error on '/api/createExpressProfile': " + err })
    );
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}