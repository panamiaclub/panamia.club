// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import newsletter from "./auth/lib/model/newsletter";
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
  email: string
) => {
  if (!validateEmail(email)) {
    return { error: "Email is invalid" };
  }

  await dbConnect();
  const emailUser = await newsletter.findOne({ email: email });
  if(emailUser){
    return { error: "You are already registered." };
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
      .json({ error: "This API call only accepts POST methods" });
  }

  // get and validate body variables
  const { name, email, membershipType, igUsername, otherURL } = req.body;

  const errorMessage = await validateForm(email);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }

// create new newsletter entry on MongoDB
const newNewsletter = new newsletter({
    name: name,
    email: email,
    membershipType: membershipType,
    igUsername: igUsername,
    otherURL: otherURL
});

newNewsletter
    .save()
    .then(() =>
    res.status(200).json({ msg: "Successfuly created new Newsletter: " + newNewsletter })
    )
    .catch((err: string) =>
    res.status(400).json({ error: "Error on '/api/createNewsletterEntry': " + err })
    );
  }


  export const config = {
    api: {
      responseLimit: '15mb',
    },
  }