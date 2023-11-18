// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

import dbConnect from "./auth/lib/connectdb";
import user from "./auth/lib/model/user";
import profile from "./auth/lib/model/profile";

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

  let page_number = 1;
  if (req.query.page_number) {
    page_number = parseInt(req.query.page_number.toString());
    if (page_number < 1) {
      page_number = 1;
    }
  }

  if (req.query.q) {
    const search_string = req.query.q;
    const per_page = 20;
    const offset = (per_page * page_number) - per_page;

    const listCount = await profile.count();
    const pagination = {
      count: listCount,
      per_page: per_page,
      offset: offset,
      page_number: page_number,
      total_pages: (listCount > 0 ? Math.ceil(listCount / per_page) : 1),
    }

    const aggregateList = await profile.aggregate([
        {
          '$search': {
            'index': 'profiles-search', 
            'compound': {
              'should': [
                {
                  'text': {
                    'query': search_string, 
                    'path': 'name', 
                    'score': {
                      'boost': {
                        'value': 5
                      }
                    }
                  }
                }, {
                  'text': {
                    'query': search_string, 
                    'path': ['five_words','tags'], 
                    'score': {
                      'boost': {
                        'value': 3
                      }
                    }
                  }
                }, {
                  'text': {
                    'query': search_string, 
                    'path': [
                      'details', 'background'
                    ]
                  }
                }
              ]
            }
          }
        }, {
          '$project': {
            'name': 1, 
            'socials': 1, 
            'five_words': 1, 
            'details': 1, 
            'score': {
              '$meta': 'searchScore'
            }
          }
        }, {
          '$limit': per_page
        }
    ]);
    if (aggregateList) {
      return res.status(200).json({ success: true, data: aggregateList, pagination: pagination }) 
    }
    return res.status(200).json({ success: true, data: [], pagination: pagination });
  }
  const randomList = await profile.aggregate([{ '$sample': { 'size': 20 } }]);
  return res.status(200).json({
    success: true,
    data: randomList,
    pagination: {},
    msg: "No Search Term",
  });
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
}