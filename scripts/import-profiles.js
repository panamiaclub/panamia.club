// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import dbConnect from "./connectdb.js";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import * as fs from "fs";

let errors = [];

const Schema = mongoose.Schema;

const slugify = (value) => {
  return value.normalize('NFD')
      .replace("&", "and")
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, '-');
}

const phoneTrim = (value) => {
  return value.toString()
    .replaceAll("(", "")
    .replaceAll(")", "")
    .replaceAll("-", "")
    .replaceAll("+", "")
    .replaceAll(" ", "")
    .replaceAll(".", "");
}

const isNumber = (value) => {
  return /^\d+$/.test(value);
}

const delay = ms => new Promise(res => setTimeout(res, ms));

const cleanDate = (value) => {
  // Convert Excel serial date (numeric) to datetime
    let newDate = value ? new Date((value - 25569) * 8.64e7) : null;
    return newDate;
}

const profileSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true
        },
        name: {
            type: String,
            required: true
        },
        slug: String,
        active: Boolean,
        status: {},
        administrative: {},
        locally_based: String,
        details: String,
        background: String,
        five_words: {
            type: String,
            required: true,
            index: true,
        },
        socials: {},
        phone_number: String,
        whatsapp_community: Boolean,
        pronouns: {},
        tags: String,
        counties: {},
        categories: {},
        primary_address: {},
        geo: {},
        locations: [],
        images: {},
        linked_profiles: [],
    },
    {
        timestamps: true
    }
)

const profile = mongoose.models.profile || mongoose.model("profile_import", profileSchema);

async function handler(profileData) {
  // console.log("handler");
  const { email, name, slug, details, background, five_words, socials, 
    phone_number, address, tags } = profileData;

  let geo = null;
  if (address?.latitude && address?.longitude) {
    geo = {
      "type": "Point",
      "coordinates": [
        address.longitude,
        address?.latitude
      ]
    }
  }

  const newProfile = new profile({
    name: name,
    email: email,
    slug: slug,
    active: true, // default to Active
    locally_based: "yes", // assume "yes"
    details: details,
    background: background,
    five_words: five_words,
    socials: socials,
    phone_number: phone_number,
    primary_address: address,
    tags: tags,
    geo: geo,
  });

  await newProfile
    .save()
    .then(() => {
        console.log("Successfuly created new Profile: " + newProfile.email );
      }
    )
    .catch((err) =>
        {
          const errString = err.toString();
          if (errString.includes("E11000")) {
            console.log(`Record: ${cntr} | Error: Duplicate key`);
          } else {
            console.log(`Record: ${cntr} | Error: ${errString}`);
            errors.push({ email, errString });
          }
        }
    );
}

function getUsersFromFile(){
    const file = "scripts/users.xlsx"
    let newJsonArray = [];
    XLSX.set_fs(fs);

    const workbook = XLSX.readFile(file);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(worksheet);

    json.forEach((item) => {
      if (item.email == "lavitatreats@gmail.com") {
        // console.log(Object.keys(item));
      } 
      const socials = {
        website: item.website,
        facebook: item.facebook ? `https://www.facebook.com/${item.facebook}` : null,
        instagram: item.instagram ? `https://www.instagram.com/${item.instagram}` : null,
        tiktok: item.tiktok ? `https://www.tiktok.com/${item.tiktok}` : null,
        twitter: item.twitter ? `https://www.twitter.com/${item.twitter}` : null,
        spotify: item.spotify,
      }

      const address = {
        street1: item.street1,
        street2: item.street2,
        city: item.city,
        state: item.state,
        zipcode: item.zipcode,
        latitude: item.latitude,
        longitude: item.longitude,
      }

      const newItem = {
        email: item.email.toString().toLowerCase().trim(),
        background: item.background,
        details: item.details, 
        five_words: item.fivewords?.toLowerCase(),
        name: item.name,
        tags: item.tags?.toLowerCase(),
        slug: slugify(item.name.toString()),
        phone_number: item.phone_number ? phoneTrim(item.phone_number) : null,
        socials: socials,
        address: address,
        createdAt: cleanDate(item?.dateadded),
      }

      newJsonArray.push(newItem);
    })
    return newJsonArray;
}

const processUsers = async (users) => {
  console.log("Profiles: ", users.length);
  for (const profileData of users) {
    cntr += 1;
    if (cntr <= 10) {
      // console.log(profile) // Print the first 10;
    }
    if (profileData.email == "seekrro@gmail.com") {
      // console.log(profileData);
    }
    if (profileData?.five_words?.length > 75 || profileData?.five_words?.length == 0) {
      // console.log("FiveWordsLength", profileData.email, " | " , profileData.five_words);
    }
    if (!(profileData?.five_words)) {
      // console.log("NoFiveWords", profileData.email);
    }
    if (profileData?.socials?.tiktok?.includes("@") ) {
      console.log("TikTokWithURL", profileData.email, " | " , profileData.socials.tiktok);
    }
    if (profileData?.phone_number && !isNumber(profileData?.phone_number)) {
      console.log("PhoneNotANumber", profileData.email, " | " , profileData.phone_number);
    }
  
    if (cntr < 1000) {
      // console.log("recordN", cntr);
      // setTimeout(() => {
      await handler(profileData).then((response) => {
        // console.log("response", response);
      });
      await delay(250);
      //}, cntr * 500);
    }
  }
  console.log(errors);
}


await dbConnect();
let cntr = 0;
const users = getUsersFromFile();
await processUsers(users);

// process.exit();