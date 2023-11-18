import type { NextPage } from 'next';
import { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import axios from 'axios';
import Link from 'next/link';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import AdminHeader from '@/components/Admin/AdminHeader';
import AdminMenu from '@/components/Admin/AdminHeader';

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

const Account_Admin: NextPage = () => {
  const { data: session } = useSession();
  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="Admin Portal | Admin" desc="" />
        <AdminMenu />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Admin Portal</h2>
          <p>The future space of a real nice dashboard :)</p>
        </div>
      </main>
    )
  }
  return (
    <main className={styles.app}>
      <PageMeta title="Unauthorized" desc="" />
      <div className={styles.main}>
        <h2 className={styles.accountTitle}>UNAUTHORIZED</h2>
        <h3 className={styles.accountTitle}>You must be logged in to view this page.</h3>
      </div>
    </main>
  )
}

export default Account_Admin;

