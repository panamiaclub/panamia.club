import mongoose from "mongoose";
const Schema = mongoose.Schema;

const userSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true
        },
        name: String,
        status: {
            role: String,
            locked: Date
        },
        alternate_emails: [],
        zip_code: String,
    },
    {
        timestamps: true
    }
)

const user = mongoose.models.user || mongoose.model("user", userSchema);
export default user;