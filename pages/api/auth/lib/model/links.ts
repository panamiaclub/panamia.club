import mongoose from "mongoose";
const Schema = mongoose.Schema;

const linksSchema = new Schema(
    {
        label: {
            type: String,
            required: true,
            unique: true
        },
        url: {
            type: String,
            required: true,
            unique: false
        },
        type: {
            type: String,
            required: false,
            unique: false
        },
        color: {
            type: String,
            required: false,
            unique: false
        }
    }
)

const links = mongoose.models.links || mongoose.model("links", linksSchema);
export default links;