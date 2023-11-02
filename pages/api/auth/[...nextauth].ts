// https://next-auth.js.org/providers/google

import NextAuth from 'next-auth'
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { MongoDBAdapter} from '@next-auth/mongodb-adapter';
// import { compare } from "bcrypt";

import clientPromise from './lib/mongodb';
// import dbConnect from './lib/connectdb';
// import auth from "./lib/model/users";


const options = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD
        }
      },
      from: process.env.EMAIL_FROM
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID || "",
      clientSecret: process.env.GOOGLE_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    
  ],
  theme: {
    logo: "/logos/2023_logo_pink.svg",
    brandColor: "#4ab3ea",
    buttonText: "#fff",
  },
  secret: process.env.NEXT_PUBLIC_SECRET,
  debug: false
}

export default NextAuth(options)