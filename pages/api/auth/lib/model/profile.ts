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
            required: true,
            unique: false
        },
        locally_based: {
            type: String,
            required: true
        },
        details: {
            type: String,
            required: true
        },
        background: {
            type: String,
            required: false
        },
        socials: {
            type: String,
            required: false
        },
        phone_number: {
            type: String,
            required: false
        },
        pronouns: {
            type: String,
            required: false
        },
        five_words: {
            type: String,
            required: true
        },
        tags: {
            type: String,
            required: false
        }
    },
    {
        timestamps: true
    }
)

const profile = mongoose.models.profile || mongoose.model("profile", profileSchema);
export default profile;