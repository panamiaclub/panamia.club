const path = require('path');
const fs = require('fs');
//joining path of directory 
const directoryPath = path.join(__dirname, './images');
const imagesArray = [];

function getExtension(file) {
    return str.slice(str.lastIndexOf("."));
}
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
        const promises = [];
        fs.readdir(panaPath, function (err, files) {
            if (err) {
                return console.log('Unable to scan folder: ' + err);
            }
            for (const file of files) {
                // console.log(dir, "file:", file);
                const handle = dir;
                // TODO: VALIDATE if handle matches an existing Pana
                const ext3 = file.toLowerCase().slice(-3);
                const ext4 = file.toLowerCase().slice(-4);
                if (ext3 == "jpg" || ext3 == "png") {
                    imagesArray.push({
                        "handle": dir,
                        "path": `images/${dir}/${file}`,
                    });
                    break;
                } else if (ext4 == "webp" || ext4 == "jpeg") {
                    imagesArray.push({
                        "handle": dir,
                        "path": `images/${dir}/${file}`,
                    });
                    break;
                }
                // TODO: Check last file, no match
            }
            if (dir == dirs[dirs.length-1]) {
                console.log("last", imagesArray);
                for (const image in imagesArray) {
                    // TODO: Move file
                    const new_path = `prepped/profile/${image.handle}/primary.${ext4}`;
                    fs.copyFile(image.path, image.new_path);
                }
            }
        })
    }
});