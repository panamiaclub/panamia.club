import mongoose from "mongoose";
const Schema = mongoose.Schema;

const eventSchema = new Schema(
    {
        primary_profile: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true
        },
        event_link: String,
        start: Date,
        end: Date,
        details: String,
        address: {},
        images: {},
        linked_profiles: [],
    },
    {
        timestamps: true
    }
)

const event = mongoose.models.event || mongoose.model("event", eventSchema);
export default event;