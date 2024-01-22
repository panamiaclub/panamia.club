// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "./auth/lib/connectdb";
import contactUs from "./auth/lib/model/contactus";
import BrevoApi from "@/lib/brevo_api";
import { splitName } from "@/lib/standardized";

interface ResponseData {
  error?: string;
  msg?: string;
}

const validateEmail = (email: string): boolean => {
  const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return regEx.test(email);
};

const callBrevo_createContact = async (email: string, name: string) => {
  const brevo = new BrevoApi();

  if (brevo.ready) {
    // const contact = await brevo.findContact(email);
    const [firstName, lastName] = splitName(name);
    const attributes = {
      "FIRSTNAME": firstName,
      "LASTNAME": lastName,
    }
    let list_ids = [];
    if (brevo.config.lists.addedByWebsite) {
      list_ids.push(parseInt(brevo.config.lists.addedByWebsite));
    }
    if (brevo.config.lists.webformContactUs) {
      list_ids.push(parseInt(brevo.config.lists.webformContactUs));
    }
    const new_contact = await brevo.createOrUpdateContact(email, attributes, list_ids);
  }
}

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
  const { name, email, message } = req.body;

  if (!validateEmail(email)) {
    return res
      .status(200)
      .json({ error: "Please enter a valid email address." });
  }

  await dbConnect();
  const newContactUs = new contactUs({
      name: name,
      email: email,
      message: message,
      acknowledged: false,
  });

  try{
    const dbResponse = await newContactUs.save()
  } catch (error) {
    return res.status(400).json({ error: "Error on '/api/createContactUs': " + error });
  }
  const promise = await Promise.allSettled([
    callBrevo_createContact(email, name),
  ]);
  return res.status(200).json({ msg: "Successfuly created new Contact Us: " + newContactUs });    
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}