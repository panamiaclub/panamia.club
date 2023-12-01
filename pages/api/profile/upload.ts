// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import busboy from "busboy";

import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";
import { deleteFile, uploadFile } from "@/lib/bunnycdn/api";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}

const getProfileByEmail = async (email: string) =>{
    await dbConnect();
    const Profile = await profile.findOne({email: email});
    return Profile;
}


const cacheRand = () => {
 return (Math.floor((Math.random() + 1) * 10000)).toString().substring(1,4)
}

const processFile = async (existingProfile: any, file: { data: Buffer, filename: string, fieldname: string, ext: string}) => {
  const filePath  = await uploadFile(file.filename, file.data)
  if (!filePath) {
    return false;
  }
  console.log("filePath", filePath);
  const existingImage = existingProfile?.images?.[file.fieldname];
  // console.log("existingImage", existingImage);
  if (existingImage &&  existingImage !== file.filename) {
      await deleteFile(existingImage);
    }
    // console.log("pre-update", file.fieldname, existingProfile.images);
    existingProfile.images = {
      ...existingProfile.images,
      ...{ [file.fieldname]: file.filename},
      ...{ [file.fieldname + "CDN"]: filePath},
    }
    // console.log("post-update", file.fieldname, existingProfile.images);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ success: false,  error: "No user session available" });
  }

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }
  const email = session.user?.email;
  if (!email) {
    return res
      .status(200)
      .json({ success: false, error: "No valid email" });
  }
  const existingProfile = await getProfileByEmail(email);
  const handle = existingProfile.slug;

  const uploadedFiles: any = [];

  const bb = busboy({ headers: req.headers });
  bb.on("file", (fieldname, file, {filename, encoding, mimeType}) => {
    console.log("onFile", fieldname, filename, encoding, mimeType);
    const buf = [] as any;
    file.on("data", (d) => {
      console.log("onFileonData");
      buf.push(d);
    }).on("end", () => {
      console.log("onFileonEnd");
      const data = Buffer.concat(buf);

      const acceptedFields = ['primary', 'gallery1','gallery2','gallery3'];
      if (filename && acceptedFields.includes(fieldname)) {
        console.log("fieldname matched");
        const ext = mimeType == "image/jpeg" ? "jpg" :
          mimeType === "image/png" ? "png" :
          mimeType === "image/webp" ? "webp" : "";
          console.log("mimeType", mimeType);
        const fileName = `profile/${handle}/${fieldname}${cacheRand()}.${ext}`;
        console.log("fileName", fileName);
        uploadedFiles.push({
          data: data,
          filename: fileName,
          fieldname: fieldname,
          ext: ext,
        });
      }
    })
  });

  
  req.pipe(bb).on('finish', () => {
    const promises: any = [];
    uploadedFiles.forEach((file: any) => {
      promises.push(new Promise(async (resolve, reject) => {
        await processFile(existingProfile, file);
        resolve(true);
      }))
    });

    Promise.all(promises).then(() => {
      existingProfile.save().then(() => {
        console.log("save");
        return res.status(200).json({ success: true, data: existingProfile })
      });
    });
  });

  if (existingProfile) {
    console.log("return response");
    // return res.status(200).json({ success: true, data: existingProfile })
  }

  // return res.status(401).json({ success: false, error: "Could not find pofile" });
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '15mb',
  },
}