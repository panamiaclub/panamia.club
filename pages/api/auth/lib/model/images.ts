import mongoose from "mongoose";
import { stripVTControlCharacters } from "util";
const Schema = mongoose.Schema;

const imageSchema = new Schema(
    {
        image: {
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

const images = mongoose.models.images || mongoose.model("images", imageSchema);
export default images;