import mongoose from "mongoose";
import { stripVTControlCharacters } from "util";
const Schema = mongoose.Schema;

const newsletterSchema = new Schema(
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
        membershipType: {
            type: String,
            required: false,
            unique: false
        },
        instagramURL: {
            type: String,
            required: false,
            unique: false
        },
        otherURL: {
            type: String,
            required: false,
            unique: false
        }
    }
)

const newsletter = mongoose.models.newsletter || mongoose.model("newsletter", newsletterSchema);
export default newsletter;