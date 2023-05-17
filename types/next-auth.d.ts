import "next-auth";

declare module "next-auth" {
  declare global{
    interface User {
      _id: string | number;
      name: string;
      email: string;
      username: string;
    }

    interface Session {
      user: User;
    }
  }
}