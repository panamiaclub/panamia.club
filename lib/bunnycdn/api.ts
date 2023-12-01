import axios from "axios";

const STORAGE_NAME = process.env.BUNNYCDN_STORAGE;
const HOST = process.env.BUNNYCDN_HOSTNAME;
const ACCESS_KEY = process.env.BUNNYCDN_APIPASSWORD;
const CDN_PATH = process.env.BUNNYCDN_CDNPATH;

export const uploadFile = async (fileName: string, file: any) => {
  if (!HOST) {
    console.log("CDN HOST not configured")
    return false;
  }
  if (!STORAGE_NAME) {
    console.log("CDN STORAGE_NAME not configured")
    return false;
  }
  if (!ACCESS_KEY) {
    console.log("CDN ACCESS_KEY not configured")
    return false;
  }
  if (!CDN_PATH) {
    console.log("CDN CDN_PATH not configured")
    return false;
  }
  const fullPath = `https://${HOST}/${STORAGE_NAME}/${fileName}`;
  console.log(`CDNBunny:PUT:${fullPath}`)
  const response = await axios.putForm(
    fullPath,
    file,
    {
      headers: {
        "AccessKey": ACCESS_KEY,
        "Content-Type": "application/octet-stream",
        "accept": "application/json",
      }
    })
  .catch((error: Error) => {
      console.log(error.name, error.message);
      return null;
  });
  if (response?.status == 201) {
    const cdnPath = `https://${CDN_PATH}/${fileName}`;
    return cdnPath;
  }
  
};

export const deleteFile = async (fileName: string) => {
  if (!HOST) {
    console.log("CDN HOST not configured")
    return false;
  }
  if (!STORAGE_NAME) {
    console.log("CDN STORAGE_NAME not configured")
    return false;
  }
  if (!ACCESS_KEY) {
    console.log("CDN ACCESS_KEY not configured")
    return false;
  }
  const fullPath = `https://${HOST}/${STORAGE_NAME}/${fileName}`;
  console.log(`CDNBunny:DELETE:${fullPath}`)
  const response = await axios.delete(
    fullPath,
    {
      headers: {
        "AccessKey": ACCESS_KEY,
        "accept": "application/json",
      }
    })
  .catch((error: Error) => {
      console.log(error.name, error.message);
      return null;
  });
  if (response?.status == 201) {
    const cdnPath = `https://${CDN_PATH}/${fileName}`;
    return cdnPath;
  }
  return null;
};