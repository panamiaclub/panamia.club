// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

import dbConnect from "./auth/lib/connectdb";
import user from "./auth/lib/model/user";
import profile from "./auth/lib/model/profile";
import { forceInt, forceString } from "@/lib/standardized";
import { getSearch } from "@/lib/server/directory";

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
  //const userSession = await user.findOne({email: session.user.email});
  //if (!(userSession?.status?.role === "admin")) {
  //  return res.status(401).json({ error: "Not Authorized:admin" });
  //}

  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }

  const rq = req.query;
  const pageNum = forceInt(forceString(rq?.page, "1"), 1);
  const pageLimit = forceInt(forceString(rq?.limit, "20"), 20);
  const searchTerm = forceString(rq?.q, "20");
  const random = forceString(rq?.random, "") ? true : false;
  const filterLocations = forceString(rq?.floc, "");
  const filterCategories = forceString(rq?.floc, "");
  
  if (!searchTerm && !random) {
    return res.status(200).json({ success: true, data: [], pagination: {} });
  }

  if (searchTerm) {
    const params = { pageNum, pageLimit, searchTerm, 
      filterLocations, filterCategories, random}
    const offset = (pageLimit * pageNum) - pageLimit;

    const apiResponse = await getSearch(params)
    if (apiResponse) {
      console.log(apiResponse);
      return res.status(200).json(apiResponse) 
    }
    return res.status(200).json({ success: true, data: [], pagination: {} });
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}