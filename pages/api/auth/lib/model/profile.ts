import mongoose from "mongoose";
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
        active: Boolean,
        status: {
            submitted: Date,
            approved: Date,
            published: Date,
            notes: String,
        },
        locally_based: String,
        details: String,
        background: String,
        socials: {
            website: {type: String},
            instagram: {type: String},
            facebook: {type: String},
            tiktok: {type: String},
            twitter: {type: String},
        },
        phone_number: String,
        pronouns: String,
        five_words: {
            type: String,
            required: true
        },
        tags: String
    },
    {
        timestamps: true
    }
)

const profile = mongoose.models.profile || mongoose.model("profile", profileSchema);
export default profile;