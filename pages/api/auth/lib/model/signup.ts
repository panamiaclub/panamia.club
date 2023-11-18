import mongoose from "mongoose";
const Schema = mongoose.Schema;

const signupSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true
        },
        name: String,
        signupType: String,
        acknowledged: Boolean,
    },
    {
        timestamps: true
    }
)

const signup = mongoose.models.signup || mongoose.model("signup", signupSchema);
export default signup;