import mongoose from "mongoose";
import { stripVTControlCharacters } from "util";
const Schema = mongoose.Schema;

const authsSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        walletAddress: {
            type: String,
            required: false,
            unique: true
        },
        preferredCrypto: {
            type: String,
            required: false,
            unique: false
        },
        category: {
            type: String,
            required: false,
            unique: false
        },
        hashedPassword: {
            type: String,
            required: true,
            minlength: 5,
          },
          image: {
            type: String,
          },
    }
)

const auths = mongoose.models.auths || mongoose.model("auths", authsSchema);
export default auths;