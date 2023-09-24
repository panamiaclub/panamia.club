import mongoose from "mongoose";
const Schema = mongoose.Schema;

const signupSchema = new Schema(
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
        signupType: {
            type: String,
            required: false,
            unique: false
        }
    },
    {
        timestamps: true
    }
)

const signup = mongoose.models.signup || mongoose.model("signup", signupSchema);
export default signup;