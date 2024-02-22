import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import Link from 'next/link';

import styles from '@/styles/account/Admin.module.css';
import PageMeta from '@/components/PageMeta';
import AdminHeader from '@/components/Admin/AdminHeader';
import AdminMenu from '@/components/Admin/AdminHeader';
import { useAdminDashboard } from '@/lib/query/admin';
import { dateXdays } from '@/lib/standardized';

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
  const {data: dashboardData } = useAdminDashboard();
  console.log("dashboardData", dashboardData);
  if (session && dashboardData) {
    const count_recent = dashboardData.recent.length;
    const filter_7days = dashboardData.recent.filter((item) => new Date(item.createdAt) > new Date(dateXdays(7)));
    const filter_1days = dashboardData.recent.filter((item) => new Date(item.createdAt) > new Date(dateXdays(1)));
    return (
      <main className={styles.app}>
        <PageMeta title="Admin Portal | Admin" desc="" />
        <AdminMenu />
        <div className={styles.main}>
          <h2 className={styles.adminTitle}>Admin Portal</h2>
          <h3>Active Profile Stats</h3>
          <table className={styles.adminTable}>
            <tbody>
              <tr>
                <th>Total</th>
                <th>Last 30 days</th>
                <th>Last 7 days</th>
                <th>Today</th>
              </tr>
              <tr>
                <td>{ dashboardData?.all }</td>
                <td>{ count_recent }</td>
                <td>{ filter_7days.length }</td>
                <td>{ filter_1days.length }</td>
              </tr>
            </tbody>
          </table>
          <br />
          <h3>New Active Profiles (last 30 days)</h3>
          {
            dashboardData.recent && 
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
              { dashboardData.recent.map((item, index) => {
                const createdDate = new Date(item?.createdAt);
                return (
                <tr key={index}>
                  <td>{ item.name }</td>
                  <td><small>{ createdDate.toLocaleDateString() } { createdDate.toLocaleTimeString() }</small></td>
                  <td><Link href={`/profile/${item.slug}`}><a target="_blank"rel="noreferrer">View</a></Link></td>
                </tr>
                )
              })
              }
              </tbody>
            </table>
          }
        </div>
      </main>
    )
  }
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

