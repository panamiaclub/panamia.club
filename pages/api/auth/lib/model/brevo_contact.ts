import mongoose from "mongoose";
const Schema = mongoose.Schema;

const brevoContactSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true
        },
        brevo_id: {
            type: Number,
            required: true
        }
    },
    {
        timestamps: true
    }
)

const brevoContact = mongoose.models.brevoContact || mongoose.model("brevoContact", brevoContactSchema);
export default brevoContact;