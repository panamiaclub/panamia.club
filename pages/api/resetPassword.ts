// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import bcrypt from "bcrypt";

interface ResponseData {
  error?: string;
  msg?: string;
}


const validateForm = async (
  email: string,
  pw: string, 
) => {
  await dbConnect();
  const emailUser = await users.findOne({ email: email });

  if (!emailUser) {
    return { error: "Email doesnt exists" };
  }

  if (pw.length < 5) {
    return { error: "Password must have 5 or more characters" };
  }

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
  const { email, password } = req.body;

  const errorMessage = await validateForm(email, password);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }

 
  const hashedPassword = await bcrypt.hash(password, 12);
  console.log(email);
  console.log(hashedPassword);

  await users.findOneAndUpdate({ email: email }, {$set: {hashedPassword:hashedPassword}}, {returnNewDocument: true})
    .then(() =>{
        console.log('success');
        res.status(200).json({ msg: "Successfuly reset password." })
    })
    .catch((err: string) =>
    res.status(400).json({ error: "Error on '/api/editFeature': " + err })
    );


}
  

