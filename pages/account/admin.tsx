import type { NextPage } from 'next';
import { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import axios from 'axios';

import styles from '../../styles/account/Admin.module.css';

export const getServerSideProps: GetServerSideProps = async function (context) {
  return {
    props: {
      session: await getServerSession(
        context.req,
        context.res,
        authOptions
      ),
    },
  }
}

const User: NextPage = () => {
  const { data: session } = useSession();
  if (session) {
    return (
      <main className={styles.app}>
        <div className={styles.main}>
          <h1>ADMIN USER PAGE</h1>
        </div>
      </main>
    )
  }
  return (
    <div>
      <h1>Unauthorized</h1>
    </div>
  )
}

export default User;

