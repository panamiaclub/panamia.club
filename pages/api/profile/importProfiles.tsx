// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ success: false,  error: "No user session available" });
  }

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }
  const eMail = session.user?.email;
  if (!eMail) {
    return res
      .status(200)
      .json({ success: false, error: "No valid email" });
  }

  const { email, name, slug, details, background, five_words, socials, phone_number, tags } = req.body;
  console.log("phone_number", phone_number);

  const newProfile = new profile({
    name: name,
    email: email,
    slug: slug,
    active:true,
    details: details,
    background:background,
    five_words: five_words,
    socials: socials,
    phone_number: phone_number,
    tags: tags
  });

  newProfile
    .save()
    .then(() =>
    res.status(200).json({ msg: "Successfuly created new Profile: " + newProfile })
    )
    .catch((err: string) =>
    res.status(400).json({ error: "Error on '/api/importProfile': " + err })
    );
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}