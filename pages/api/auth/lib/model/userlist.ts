import mongoose from "mongoose";
const Schema = mongoose.Schema;

const userlistSchema = new Schema(
    {
        user_id: {
            type: String,
            required: true,
        },
        name: String,
        desc: String,
        public: Boolean,
        profiles: [],
    },
    {
        timestamps: true
    }
)

const userlist = mongoose.models.userlist || mongoose.model("userlist", userlistSchema);
export default userlist;