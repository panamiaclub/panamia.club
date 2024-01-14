import React, { useState } from "react";
import * as XLSX from "xlsx";
import axios from "axios";

function ExcelToJsonConverter() {
  const [file, setFile] = useState(null);
  const [importConfirmation, setImportConfirmation] = useState(false);
  const [jsonData, setJsonData] = useState("");

  async function importUsers() {
        const res = await axios
        .post(
            "/api/importProfiles",
            { jsonData },//todo: add slug, format socials
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        )
        .then(async (response) => {
            if (response.data.error) {
                alert(response.data.error) // soft error should display for user to correct
            } else {
                setImportConfirmation(true);
                alert("Profiles have been imported!");
            }
        })
        .catch((error) => {
            console.log(error);
            alert("There was a problem uploading these users: " + error.message);
        });
        console.log(res);
}

  const handleConvert = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e:any) => {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        setJsonData(JSON.stringify(json, null, 2));
        console.log(json)

        let newJsonArray = [{}];
        //todo: collapse socials into a socials object {}
        json.forEach((item:any) => {
          
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
    }
  };

  return (
    <div style={{minHeight:"60vh", textAlign:"center", padding:"5%"}}>
      <input
        type="file"
        accept=".xls,.xlsx"
        onChange={(e:any) => setFile(e.target.files[0])}
      />
      <button onClick={handleConvert}>Convert</button>
      <pre>{jsonData}</pre>
    </div>
  );
}

export default ExcelToJsonConverter;