import mongoose from "mongoose";
const Schema = mongoose.Schema;

const contactUsSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        message: String,
        acknowledged: Boolean,
    },
    {
        timestamps: true
    }
)

const contactUs = mongoose.models.contactUs || mongoose.model("contactUs", contactUsSchema);
export default contactUs;