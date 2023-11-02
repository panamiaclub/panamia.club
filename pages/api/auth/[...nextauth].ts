// https://next-auth.js.org/providers/google

import NextAuth from 'next-auth'
import GoogleProvider from "next-auth/providers/google";


const options = {
  providers: [
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
  pages:{
      signIn: '/api/auth/signin'
  },
  secret: process.env.NEXT_PUBLIC_SECRET,
  debug: false
}

export default NextAuth(options)