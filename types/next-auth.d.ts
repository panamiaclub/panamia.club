import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    _id: string | number;
    name: string;
    email: string;
    username: string;
  }

  interface Session {
    user: {
    } & DefaultSession["user"];
  } 
}