// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "./auth/lib/connectdb";
import users from "./auth/lib/model/users";
import artIntake from "./auth/lib/model/artintake";
import servicesIntake from "./auth/lib/model/servicesintake";
import orgIntake from "./auth/lib/model/orgintake";
import apparelIntake from "./auth/lib/model/apparelintake";
import goodsIntake from "./auth/lib/model/goodsintake";
import foodIntake from "./auth/lib/model/foodintake";

import { ObjectId } from "mongodb";
import { CgFontSpacing } from "react-icons/cg";

interface ResponseData {
  error?: string;
  success?: boolean;
  msg?: string;
  data?: any[];
}
const getServicesIntakes = async (email: string) =>{
    await dbConnect();
    console.log(email);
    const intake = await servicesIntake.findOne({email: email, complete: true});
    if(intake){
        console.log('true - form completed')
        return true;
    }else{
        return false;
    }
}

const getArtIntakes = async (email: string) =>{
    await dbConnect();
    console.log(email);
    const intake = await artIntake.findOne({email: email, complete: true});
    if(intake){
        console.log('true - form completed')
        return true;
    }else{
        return false;
    }
}

const getGoodsIntakes = async (email: string) =>{
    await dbConnect();
    console.log(email);
    const intake = await goodsIntake.findOne({email: email, complete: true});
    if(intake){
        console.log('true - form completed')
        return true;
    }else{
        return false;
    }
}

const getFoodIntakes = async (email: string) =>{
    await dbConnect();
    console.log(email);
    const intake = await foodIntake.findOne({email: email, complete: true});
    if(intake){
        console.log('true - form completed')
        return true;
    }else{
        return false;
    }
}

const getOrgIntakes = async (email: string) =>{
    await dbConnect();
    console.log(email);
    const intake = await orgIntake.findOne({email: email, complete: true});
    if(intake){
        console.log('true - form completed')
        return true;
    }else{
        return false;
    }
}

const getApparelIntakes = async (email: string) =>{
    await dbConnect();
    console.log(email);
    const intake = await apparelIntake.findOne({email: email, complete: true});
    if(intake){
        console.log('true - form completed')
        return true;
    }else{
        return false;
    }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {

  // validate if it is a GET
  if (req.method !== "GET") {
    return res
      .status(200)
      .json({ error: "This API call only accepts GET methods" });
  }
  let category = "";
  let Email = "";
 let intake = false;
  if(req.query.userEmail && req.query.category){
    Email = req.query.userEmail.toString();
    category = req.query.category.toString();
    console.log(category);
    console.log(Email , category)
    try{
        if(category == "Services"){
            intake = await getServicesIntakes(Email.toString());
         }else if(category == "Art"){
            intake = await getArtIntakes(Email.toString());
         }else if(category == "Food"){
            intake = await getFoodIntakes(Email.toString());
         }else if(category == "Apparel/Accessories"){
            intake = await getApparelIntakes(Email.toString());
         }else if(category == "Collectives/Platforms"){
            intake = await getOrgIntakes(Email.toString());
         }else if(category == "Goods"){
            intake = await getGoodsIntakes(Email.toString());
         }

        return res.status(200).json({ success: true, data: [intake] });
    }catch(err: any){
      return res.status(400).json({ error: "Error on '/api/getIntakeFormStatus': " + err })
    }
  }
  
}