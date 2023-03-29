import mongoose from "mongoose";
import { stripVTControlCharacters } from "util";
const Schema = mongoose.Schema;

const followersSchema = new Schema(
    {
        followerId: {
            type: String,
            required: true,
            unique: false
        },
        userId: {
            type: String,
            required: true,
            unique: false
        }
    }
)

const followers = mongoose.models.followers || mongoose.model("followers", followersSchema);
export default followers;