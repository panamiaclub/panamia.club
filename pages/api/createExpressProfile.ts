// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import dbConnect from "./auth/lib/connectdb";
import profile from "./auth/lib/model/profile";
import BrevoApi from "@/lib/brevo_api";
import { createUniqueString, slugify, splitName } from "@/lib/standardized";

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
    if (brevo.config.lists.webformProfile) {
      list_ids.push(parseInt(brevo.config.lists.webformProfile));
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
  const {
    name,
    email,
    locally_based,
    details,
    background,
    socials,
    phone_number,
    whatsapp_community,
    pronouns,
    five_words,
    tags,
    hearaboutus
    } = req.body;

    console.log({
      name,
      email,
      locally_based,
      details,
      background,
      socials,
      phone_number,
      whatsapp_community,
      pronouns,
      five_words,
      tags,
      hearaboutus
      });

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

  // TODO: Set initial completion percentage?
  const newProfile = new profile({
      name: name,
      email: email,
      slug: slugify(name),
      active: false, // TODO: set to false on launch/approval process
      status: {
        submitted: new Date(),
        access: createUniqueString(),
      },
      locally_based: locally_based,
      details: details,
      background: background,
      socials: socials,
      phone_number: phone_number,
      whatsapp_community: whatsapp_community,
      pronouns: pronouns,
      five_words: five_words,
      tags: tags,
      hearaboutus: hearaboutus,
  }, {strict: false});

  try{
    const dbResponse = await newProfile.save()
  } catch (error) {
    return res.status(400).json({ error: "Error on '/api/createExpressProfile': " + error });
  }
  const promise = await Promise.allSettled([
    callBrevo_createContact(email, name),
  ]);
  return res.status(200).json({ msg: "Successfuly created new Profile: " + newProfile.email });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}