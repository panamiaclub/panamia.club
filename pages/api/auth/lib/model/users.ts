import mongoose from "mongoose";
import { stripVTControlCharacters } from "util";
const Schema = mongoose.Schema;

const usersSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true
        },
        fullname: {
            type: String,
            required: false,
            unique: true
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        instagramHandle: {
            type: String,
            required: false,
            unique: false
        },
        twitterHandle: {
            type: String,
            required: false,
            unique: false
        },
        link1: {
            type: String,
            required: false,
            unique: false
        },
        link2: {
            type: String,
            required: false,
            unique: false
        },
        bio: {
            type: String,
            required: false,
            unique: false
        },
        category: {
            type: Array,
            required: false,
            unique: false
        },
        avatarIMG: {
            type: String,
            required:false,
            unique:false
        },
        images: {
            type: Array,
            required: false,
            unique: false
        },
        hashedPassword: {
            type: String,
            required: true,
            minlength: 5,
          }
    }
)

const users = mongoose.models.users || mongoose.model("users", usersSchema);
export default users;