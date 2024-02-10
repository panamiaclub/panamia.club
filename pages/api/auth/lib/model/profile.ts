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
        slug: String,
        active: Boolean,
        status: {},
        administrative: {},
        locally_based: String,
        details: String,
        background: String,
        five_words: {
            type: String,
            required: true,
            index: true,
        },
        socials: {},
        phone_number: String,
        whatsapp_community: Boolean,
        pronouns: {},
        tags: String,
        hearaboutus: String,
        affiliate: String,
        counties: {},
        categories: {},
        primary_address: {},
        gentedepana: {},
        geo: {},
        locations: [],
        images: {},
        linked_profiles: [],
    },
    {
        timestamps: true
    }
)

const profile = mongoose.models.profile || mongoose.model("profile", profileSchema);

export default profile;