// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "./auth/lib/connectdb";
import signup from "./auth/lib/model/signup";
import brevoContact from "./auth/lib/model/brevo_contact";
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
  const existingContact = await brevoContact.findOne({email: email});
  if (existingContact) {
    return false; // skip since already created/updated in Brevo
  }

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
    if (brevo.config.lists.webformNewsletter) {
      list_ids.push(parseInt(brevo.config.lists.webformNewsletter));
    }
    const brevoResponse = await brevo.createOrUpdateContact(email, attributes, list_ids);
    const new_contact = new brevoContact();
    new_contact.email = email;
    new_contact.brevo_id = brevoResponse.id;
    await new_contact.save();
  }
}

const callBrevo_sendAdminNoticeEmail = async (name: string, email: string, signup_type: string) => {
  const brevo = new BrevoApi();
  const template_id = brevo.config.templates.adminSignupConfirmation;
  if (template_id) {
    const params = {
      name: name,
      email: email,
      signup_type: signup_type,
    }
    const response = await brevo.sendTemplateEmail(parseInt(template_id), params);
    // TODO: Confirm 201 response from Brevo
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

  try{
    const dbResponse = await newSignup.save()
  } catch (error) {
    return res.status(400).json({ error: "Error on '/api/createSignup': " + error })
  }
  const promise = await Promise.allSettled([
    callBrevo_createContact(email, name),
    callBrevo_sendAdminNoticeEmail(name, email, signup_type),
  ]);
  return res.status(200).json({ msg: "Successfuly created new Signup: " + newSignup })
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}