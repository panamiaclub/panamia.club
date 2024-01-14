// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import dbConnect from "../auth/lib/connectdb";
import profile from "../auth/lib/model/profile";


async function handler(user) {

  if (req.method !== "POST") {
    return res
      .status(200)
      .json({ success: false,  error: "This API call only accepts POST methods" });
  }

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
    const file = "Users.xlsx"
    const reader = new FileReader();
    let newJsonArray = [{}];

    reader.onload = (e) => {
      const data = e.target.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      setJsonData(JSON.stringify(json, null, 2));
   
      //todo: collapse socials into a socials object {}
      json.forEach((item) => {
        
       const socials = {
          website: item.website,
          facebook: item.facebook,
          instagram: item.instagram,
          tiktok: item.tiktok,
          twitter: item.twitter,
          spotify: item.spotify,
       }

       const newItem = {
        background: item.background,
        details: item.details, 
        email: item.email,
        five_words: item.five_words,
        name: item.name,
        tags: item.tags,
        slug: item.name.toString().toLower().replace(" ", "_"),
        phone_number: item.phone_number,
        createdAt: new Date(item.date_added.toString())
       }

       newJsonArray.push(newItem);
      })

      console.log("new formatted Json array");
      console.log(newJsonArray);
    };
    reader.readAsBinaryString(file);

    handler();
}

await dbConnect();
getUsersFromFile();

export const config = {
  api: {
    responseLimit: '15mb',
  },
}