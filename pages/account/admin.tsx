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

  const onlyDate = (date: Date) => {
    return new Date(new Date(date).toLocaleDateString())
  }

  const growthPercentage = (base: number, growth: number) => {
    if (growth == 0) return "0%";
    if (base == 0) return "100%";
    return `${(((growth - base)/base) * 100).toFixed(2)}%`;
  }

  if (session && dashboardData) {
    const count_recent = dashboardData.recent.length;
    const daysToSunday = new Date().getDay();
    const filter_week1 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) >= dateXdays(daysToSunday) && onlyDate(item.createdAt) < dateXdays(daysToSunday + 7))
    );
    const filter_week2 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) >= dateXdays(daysToSunday + 7) && onlyDate(item.createdAt) < dateXdays(daysToSunday + 14))
    );
    const filter_week3 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) >= dateXdays(daysToSunday + 14) && onlyDate(item.createdAt) < dateXdays(daysToSunday + 21))
    );
    const filter_week4 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) >= dateXdays(daysToSunday + 21) && onlyDate(item.createdAt) < dateXdays(daysToSunday + 28))
    );
    const filter_4weekstotal = dashboardData.recent.filter(
      (item) => onlyDate(item.createdAt) >= dateXdays(daysToSunday + 21)
    );
    // console.log(dateXdays(daysToSunday), dateXdays(daysToSunday + 21));
    // Subtract final value minus starting value
    // Divide that amount by the absolute value of the starting value
    // Multiply by 100 to get percent increase
    // If the percentage is negative, it means there was a decrease and not an increase.
    return (
      <main className={styles.app}>
        <PageMeta title="Admin Portal | Admin" desc="" />
        <AdminMenu />
        <div className={styles.main}>
          <h2 className={styles.adminTitle}>Admin Portal</h2>
          <h3>Active Profile Growth</h3>
          <table className={styles.adminTable}>
            <tbody>
              <tr>
                <th>3 weeks ago</th>
                <th>2 weeks ago</th>
                <th>Last Week</th>
                <th>This Week</th>
              </tr>
              <tr>
                <td>
                  <strong>{ filter_week4.length }</strong>&emsp;
                  <small></small>
                </td>
                <td>
                  <strong>{ filter_week3.length }</strong>&emsp;
                  <small>{growthPercentage(filter_week4.length, filter_week3.length)}</small>
                </td>
                <td>
                  <strong>{ filter_week2.length }</strong>&emsp;
                  <small>{growthPercentage(filter_week3.length, filter_week2.length)}</small>
                </td>
                <td>
                  <strong>{ filter_week1.length }</strong>&emsp;
                  <small>{growthPercentage(filter_week2.length, filter_week1.length)}</small>
                </td>
              </tr>
            </tbody>
          </table>
          <small>Total Profiles: { dashboardData?.all }</small>
          <br />
          <h3>New Active Profiles (last 4 weeks)</h3>
          {
            filter_4weekstotal && 
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
              { filter_4weekstotal.map((item, index) => {
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

