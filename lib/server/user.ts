import dbConnect from "pages/api/auth/lib/connectdb";
import user from "pages/api/auth/lib/model/user";

export const getUser = async (email: string) => {
    await dbConnect();
    return await user.findOne({email: email});
}