// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import signup from "./auth/lib/model/signup";

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
  const { name, email, signup_type } = req.body;

  await dbConnect();
  const emailUser = await signup.findOne({ email: email });
  if(emailUser){
    return res
      .status(200)
      .json({ error: "You are already registered." });
  }

  if (!validateEmail(email)) {
    return res
      .status(200)
      .json({ error: "Please enter a valid email address." });
  }

  const newSignup = new signup({
      name: name,
      email: email,
      signupType: signup_type,
  });

  newSignup
    .save()
    .then(() =>
      res.status(200).json({ msg: "Successfuly created new Signup: " + newSignup })
    )
    .catch((err: string) =>
      res.status(400).json({ error: "Error on '/api/createSignup': " + err })
    );
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}