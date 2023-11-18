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
        status: {},
        locally_based: String,
        details: String,
        background: String,
        socials: {},
        phone_number: String,
        whatsapp_community: Boolean,
        pronouns: {},
        five_words: {
            type: String,
            required: true,
            index: true,
        },
        tags: String,
        search_data: {
            type: String,
            index: true,
        },
        images: {}
    },
    {
        timestamps: true
    }
)

const profile = mongoose.models.profile || mongoose.model("profile", profileSchema);
profile.ensureIndexes();

export default profile;