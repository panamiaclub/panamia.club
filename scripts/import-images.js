
const dbConnect = require("./connectdb.js");
const mongoose = require("mongoose");
const path = require('path');
const fs = require('fs');
//joining path of directory 
const directoryPath = path.join(__dirname, './images');
const imagesArray = [];
let profileMatches = 0;
let profileTotal = 0;
const unMatched = [];

const delay = ms => new Promise(res => setTimeout(res, ms));

const Schema = mongoose.Schema;
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
const profile = mongoose.models.profile || mongoose.model("profiles", profileSchema);

const slugify = (value) => {
    return value.normalize('NFD')
        .replaceAll("_", " ")
        .replaceAll("&", "and")
        .replaceAll(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replaceAll(/[^a-z0-9 ]/g, '')
        .replaceAll(/\s+/g, '-');
  }

function getExtension(file) {
    return str.slice(str.lastIndexOf("."));
}

dbConnect().then( (connection) => {
    console.log("DB Connected");
    main();
});
console.log("DB Connection");

function main() {
    //passsing directoryPath and callback function
    fs.readdir(directoryPath, function (err, dirs) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 
        //listing all files using forEach
        const finalDir = dirs.length;
        for (const dir of dirs) {
            // console.log("dir:", dir);
            const panaPath = path.join(__dirname, `./images/${dir}`);
            const handle = slugify(dir);
            profile.findOne({"slug": handle}).then((foundProfile) => {
                if (foundProfile) {
                    profileMatches = profileMatches + 1;
                    profileTotal = profileTotal + 1;
                    // console.log(`Profile Matched: ${foundProfile.name}`);
                    fs.readdir(panaPath, function (err, files) {
                        if (err) {
                            return console.log('Unable to scan folder: ' + err);
                        }
                        for (const file of files) {
                            // console.log(dir, "file:", file);
                            const slug = foundProfile.slug;
                            // TODO: VALIDATE if handle matches an existing Pana
                            const ext3 = file.toLowerCase().slice(-3);
                            const ext4 = file.toLowerCase().slice(-4);
                            if (ext3 == "jpg" || ext3 == "png") {
                                imagesArray.push({
                                    "handle": slug,
                                    "path": `scripts/images/${dir}/${file}`,
                                    "new_path": `prepped/profile/${slug}/primary.${ext3}`,
                                });
                                break;
                            } else if (ext4 == "webp" || ext4 == "jpeg") {
                                imagesArray.push({
                                    "handle": slug,
                                    "path": `scripts/images/${dir}/${file}`,
                                    "new_path": `prepped/profile/${slug}/primary.${ext4}`,
                                });
                                break;
                            }
                            // TODO: Check last file, no match
                        }
                        if (dir == dirs[dirs.length-1]) {
                            // console.log("last", imagesArray);
                            delay(2000).then((resp) => {
                                console.log("delayed:2 seconds");
                                for (const i in imagesArray) {
                                    const image = imagesArray[i];
                                    if (image.new_path) {
                                        delay(250).then((resp) => {
                                            console.log("delayed: " + 1);
                                            profile.findOne({"slug": image.handle}).then((imageProfile) => {
                                                if (imageProfile) {
                                                    if (imageProfile?.images?.primary) {
                                                        console.log(`Image already exists: ${imageProfile.images.primary}`);
                                                        return true;
                                                    }
                                                    
                                                    const justPath = image.new_path.substring(8);
                                                    const images = {
                                                        "primary": justPath,
                                                        "primaryCDN": `https://panamia.b-cdn.net/${justPath}`
                                                        }
                                                    imageProfile.set("images", images, { strict: false });
                                                    imageProfile.save().then((resp) => {
                                                        console.log(`Profile images saved: ${imageProfile.name}`);
                                                    })
                                                } else {
                                                    console.log("No Image Profile");
                                                }
                                            }).catch((err) => {
                                                console.log(err);
                                            });
                                        });
                                        // TODO: Save to database
                                        
                                        /*
                                        // COMMENTED OUT SINCE ALREADY RAN AND COMPLETED
                                        const dirPath = image.new_path.slice(0,image.new_path.lastIndexOf("/"));
                                        console.log("dirPath", dirPath);
                                        fs.mkdir(path.join(__dirname, dirPath),
                                            { recursive: true },
                                            (err) => {
                                            if (err) {
                                                return console.error(err);
                                            }
                                            fs.copyFile(image.path, `scripts/${image.new_path}`, function (err, output) {
                                                if (err) {
                                                    return console.log('Unable to copy file: ' + err);
                                                }
                                                // console.log("")
                                            });
                                        });
                                        */
                                    }
                                    
                                }
                            });
                            
                        }
                    });
                } else {
                    profileTotal = profileTotal + 1;
                    unMatched.push(handle);
                    // console.log(`No Profile Match: ${handle}`);
                }
                if (dir == dirs[dirs.length-1]) {
                    delay(2000).then((resp) => {
                        console.log(`matches/total = ${profileMatches}/${profileTotal}` );
                        console.log(unMatched);
                    });
                    
                }
            });
        }
    });
}
