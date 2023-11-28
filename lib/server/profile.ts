import dbConnect from "pages/api/auth/lib/connectdb";
import profile from "pages/api/auth/lib/model/profile";

export const getProfile = async (email: string) => {
    await dbConnect();
    return await profile.findOne({email: email});
}