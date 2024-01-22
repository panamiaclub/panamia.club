// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

import dbConnect from "./auth/lib/connectdb";
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

  dbConnect();
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

  dbConnect();
  const listCount = await user.count();
  const pagination = {
    count: listCount,
    per_page: per_page,
    offset: offset,
    page_number: page_number,
    total_pages: (listCount > 0 ? Math.ceil(listCount / per_page) : 1),
  }
  const paginatedList = await user.find().sort({createdAt: "desc"}).limit(per_page).skip(offset);
  if (paginatedList) {
    return res.status(200).json({ success: true, data: paginatedList, pagination: pagination }) 
  }
  return res.status(200).json({ success: true, data: [], pagination: pagination });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}