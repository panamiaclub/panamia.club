import mongoose from "mongoose";
const Schema = mongoose.Schema;

const interactionSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
        },
        action: String,
        affilate: String,
        points: Number,
    },
    {
        timestamps: true
    }
)

const interaction = mongoose.models.interaction || mongoose.model("interaction", interactionSchema);

export default interaction;