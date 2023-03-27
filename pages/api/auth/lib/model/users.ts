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
            unique: false
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
            type: [],
            required: false,
            unique: false
        },
        avatar: {
            type: String,
            required:false,
            unique:false
        },
        bannerImage: {
            type: String,
            required:false,
            unique:false
        },
        hashedPassword: {
            type: String,
            required: true,
            minlength: 5,
            unique:false
        },
        admin: {
            type: Boolean,
            required: false,
            unique:false
        },
        featured:{
            type: Boolean,
            required: false,
            unique:false
        },
        onboardingFormComplete:{
            type: Boolean,
            required: false,
            unique:false
        },
        location: {
            type: String,
            required: false,
            unique:false
        },
        dateJoined: {
            type: Date,
            required: false,
            unique:false
        }


    }
)

const users = mongoose.models.users || mongoose.model("users", usersSchema);
export default users;