import mongoose from "mongoose";
import { stripVTControlCharacters } from "util";
const Schema = mongoose.Schema;

const artIntakeSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true
        },
        name: {
            type: String,
            required: false,
            unique: false
        },
        about: {
            type: String,
            required: false,
            unique: false
        },
        category: {
            type: String,
            required: false,
            unique: false
        },
        backgroundEthnicity: {
            type: String,
            required: false,
            unique: false
        },
        igUsername: {
            type: String,
            required: false,
            unique: false
        },
        twitterHandle: {
            type: String,
            required: false,
            unique: false
        },
        website: {
            type: String,
            required: false,
            unique: false
        },
        logo: {
            type: String,
            required: false,
            unique: false
        },
        mediums: {
            type: [],
            required: false,
            unique: false
        },
        source: {
            type: [],
            required: false,
            unique: false
        },
        productType: {
            type: String,
            required: false,
            unique: false
        },
        tags: {
            type: [],
            required: false,
            unique: false
        },
        interest: {
            type: String,
            required: false,
            unique: false
        },
        image1: {
            type: String,
            required: false,
            unique: false
        },
        image2: {
            type: String,
            required: false,
            unique: false
        },
        image3: {
            type: String,
            required: false,
            unique: false
        },
        marketInterest: {
            type: String,
            required: false,
            unique: false
        },
        businessNeed: {
            type: String,
            required: false,
            unique: false
        },
        workshop: {
            type: String,
            required: false,
            unique: false
        },
        workshopDetails: {
            type: String,
            required: false,
            unique: false
        },
        igConsent: {
            type: String,
            required: false,
            unique: false
        },
        marketConsent: {
            type: String,
            required: false,
            unique: false
        },
        collabConsent: {
            type: String,
            required: false,
            unique: false
        },
        referrals: {
            type: String,
            required: false,
            unique: false
        },
        complete:{
            type: Boolean,
            required: false,
            unique: false
        }
    }
)

const artIntake = mongoose.models.artIntake || mongoose.model("artIntake", artIntakeSchema);
export default artIntake;