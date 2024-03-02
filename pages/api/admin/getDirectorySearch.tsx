// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./../auth/[...nextauth]";

import dbConnect from ".././auth/lib/connectdb";
import { forceInt, forceString } from "@/lib/standardized";
import { getSearch } from "@/lib/server/directory";
import user from "../auth/lib/model/user";
import { getAdminSearch } from "@/lib/server/admin";

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

  //if (!session) { // secured route
  //  return res.status(401).json({ error: "Not Authorized:session" });
  //}

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

  const rq = req.query;
  const pageNum = forceInt(forceString(rq?.page, "1"), 1);
  const pageLimit = forceInt(forceString(rq?.limit, "20"), 20);
  const searchTerm = forceString(rq?.q, "");


  const params = { pageNum, pageLimit, searchTerm }

  const apiResponse = await getAdminSearch(params);
  if (apiResponse) {
    // console.log(apiResponse);
    return res.status(200).json(apiResponse) 
  }
  return res.status(200).json({ success: true, data: [], pagination: {} });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}