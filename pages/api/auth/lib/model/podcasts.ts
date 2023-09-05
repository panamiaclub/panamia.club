import mongoose from "mongoose";
const Schema = mongoose.Schema;

const podcastsSchema = new Schema(
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
        category: {
            type: String,
            required: true,
            unique: false
        },
        order: {
            type: String,
            required: true,
            unique: false
        },
    }
)

const podcasts = mongoose.models.podcasts || mongoose.model("podcasts", podcastsSchema);
export default podcasts;