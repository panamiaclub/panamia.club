// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import goodsIntake from "./auth/lib/model/goodsintake";

interface ResponseData {
  error?: string;
  msg?: string;
}

const validateEmail = (email: string): boolean => {
  const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return regEx.test(email);
};

const validateForm = async (
  email: string
) => {
  if (!validateEmail(email)) {
    return { error: "Email is invalid" };
  }

  await dbConnect();
  return null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // validate if it is a POST
  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ error: "This API call only accepts POST methods" });
  }

  // get and validate body variables
  const { email, name, about, backgroundEthnicity, igUsername, twitterHandle, website, logo, category, locationOptions, address, audience, tags, interest, image1, image2, image3, marketInterest, businessNeed, workshop, workshopDetails, igConsent, marketConsent, collabConsent, complete, referrals } = req.body;

  const errorMessage = await validateForm(email);
  if (errorMessage) {
    return res.status(400).json(errorMessage as ResponseData);
  }

// create new newsletter entry on MongoDB
const newGoodsIntake = new goodsIntake({
  email: email,
   name: name,
    about: about,
      backgroundEthnicity:backgroundEthnicity,
       igUsername:igUsername,
        twitterHandle:twitterHandle,
         website:website,
          logo:logo,
           category:category,
           locationOptions:locationOptions,
           address:address,
           audience:audience,
              tags:tags,
               interest:interest,
                image1:image1,
                 image2:image2,
                  image3:image3,
                  marketInterest:marketInterest,
                   businessNeed:businessNeed,
                    workshop:workshop,
                     workshopDetails:workshopDetails,
                      igConsent:igConsent,
                       marketConsent:marketConsent,
                        collabConsent:collabConsent,
                         complete:complete,
                         referrals:referrals
});

newGoodsIntake
    .save()
    .then(() =>
      res.status(200).json({ msg: "Successfuly created new GoodsIntake Entry: " + newGoodsIntake })
    )
    .catch((err: string) =>
      res.status(400).json({ error: "Error on '/api/createGoodsIntakeEntry': " + err })
    );
  }


  export const config = {
    api: {
      responseLimit: '15mb',
    },
  }