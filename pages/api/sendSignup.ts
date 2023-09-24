// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import sendEmail from '../../lib/brevo_fetch';

interface ResponseData {
  error?: string;
  msg?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  const { name, email, signup_type } = req.body;
  const subject = "New PanaMia Signup"
  var body = `
  <p>A new website signup submission has been completed</p>
  <ul>
  <li><strong>Name:</strong> ${name}</li>
  <li><strong>Email:</strong> ${email}</li>
  <li><strong>Signup Type:</strong> ${signup_type}</li>
  </ul>
  `
  const brevoResponse = sendEmail(subject, body);
  // TODO: Confirm 201 response from Brevo
  res.status(200).json({ msg: "Email Queued with Brevo" })
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}