// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

import dbConnect from "./auth/lib/connectdb";
import contactUs from "./auth/lib/model/contactus";
import user from "./auth/lib/model/user";

interface ResponseData {
  error?: string,
  success?: boolean,
  msg?: string,
  data?: any[],
  pagination?: {},
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) { // secured route
    return res.status(401).json({ error: "Not Authorized:session" });
  }

  await dbConnect();
  const userSession = await user.findOne({email: session.user.email});
  if (!(userSession?.status?.role === "admin")) {
    return res.status(401).json({ error: "Not Authorized:admin" });
  }

  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }

  let page_number = 1;
  if (req.query.page_number) {
    page_number = parseInt(req.query.page_number.toString());
    if (page_number < 1) {
      page_number = 1;
    }
  }

  const per_page = 20;
  const offset = (per_page * page_number) - per_page;

  const contactUsCount = await contactUs.count();
  const pagination = {
    count: contactUsCount,
    per_page: per_page,
    offset: offset,
    page_number: page_number,
    total_pages: (contactUsCount > 0 ? Math.ceil(contactUsCount / per_page) : 1),
  }
  const contactUsList = await contactUs.find().sort({createdAt: "desc"}).limit(per_page).skip(offset);
  if (contactUsList) {
    return res.status(200).json({ success: true, data: contactUsList, pagination: pagination }) 
  }
  return res.status(200).json({ success: true, data: [], pagination: pagination });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}