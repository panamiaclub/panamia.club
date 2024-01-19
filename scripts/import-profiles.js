// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import dbConnect from "./connectdb.js";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import * as fs from "fs";

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

async function handler(user) {

  const { email, name, slug, details, background, five_words, socials, phone_number, tags } = user;
  console.log("phone_number", phone_number);

  const newProfile = new profile({
    name: name,
    email: email,
    slug: slug,
    active: true,
    details: details,
    background: background,
    five_words: five_words,
    socials: socials,
    phone_number: phone_number,
    tags: tags
  });

  newProfile
    .save()
    .then(() =>
        console.log("Successfuly created new Profile: " + newProfile )
    )
    .catch((err) =>
        console.log("Error on 'import- profile': " + err )
    );
}

function getUsersFromFile(){
    const file = "scripts/users.xlsx"
    let newJsonArray = [{}];
    XLSX.set_fs(fs);

    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet);
    // console.log(JSON.stringify(json, null, 2));
    // console.log(json);
  
    //todo: collapse socials into a socials object {}
    let cntr = 0;
    json.forEach((item) => {

      cntr += 1;
      
      const socials = {
        website: item.website,
        facebook: item.facebook,
        instagram: item.instagram,
        tiktok: item.tiktok,
        twitter: item.twitter,
        spotify: item.spotify,
      }

      const newItem = {
      email: item.email,
      background: item.background,
      details: item.details, 
      five_words: item.five_words,
      name: item.name,
      tags: item.tags,
      slug: slugify(item.name.toString()),
      phone_number: item.phone_number,
      createdAt: new Date(item.dateadded.toString())
      }

      newJsonArray.push(newItem);
      if (cntr == 10) {
        console.log(newJsonArray) // Print the first 10;
      }
    })

    // console.log("new formatted Json array");
    //console.log(newJsonArray);

    // newJsonArray.forEach((item) => {
    //     setTimeout(() => {
    //         handler(item);
    //     }, index * 2000);
    // })
}

await dbConnect();
getUsersFromFile();
process.exit();