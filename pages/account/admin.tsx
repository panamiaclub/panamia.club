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
import PanaLinkButton from '@/components/PanaLinkButton';
import { FormEvent } from 'react';
import axios from 'axios';

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
  const dayPlus1 = (date: Date) => {
    return new Date(date.setDate(date.getDate() + 1));
  }
  const adminShortDate = (date: Date) => {
    const dateString = date.toLocaleDateString()
    return dateString.slice(0, dateString.lastIndexOf("/"));
  }

  const growthPercentage = (base: number, growth: number) => {
    if (growth == 0) return "0%";
    if (base == 0) return "100%";
    return `${(((growth - base)/base) * 100).toFixed(2)}%`;
  }

  const resendSubmission = (e: FormEvent, email: string) => {
    e.preventDefault();
    axios.post(
            "/api/profile/sendSubmission",
            { email: email, },
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        ).then((response) => {
          alert("Profile Submission Email has been re-sent")
        }) // Blind send, no need to confirm
  }

  if (session && dashboardData) {
    // const count_recent = dashboardData.recent.length;
    const daysToSunday = new Date().getDay();
    const week1_start = onlyDate(dateXdays(daysToSunday))
    const week2_start = onlyDate(dateXdays(daysToSunday + 7))
    const week3_start = onlyDate(dateXdays(daysToSunday + 14))
    const week4_start = onlyDate(dateXdays(daysToSunday + 21))
    const filter_week1 = dashboardData.recent.filter(
      (item) => onlyDate(item.createdAt) > week1_start
    );
    const filter_week2 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) > week2_start && onlyDate(item.createdAt) <= week1_start)
    );
    const filter_week3 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) > week3_start && onlyDate(item.createdAt) <= week2_start)
    );
    const filter_week4 = dashboardData.recent.filter(
      (item) => (onlyDate(item.createdAt) > week4_start && onlyDate(item.createdAt) <= week3_start)
    );
    const filter_4weekstotal = dashboardData.recent.filter(
      (item) => onlyDate(item.createdAt) > week4_start
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
                <th>{ adminShortDate(dayPlus1(week4_start)) } to { adminShortDate(week3_start) }</th>
                <th>{ adminShortDate(dayPlus1(week3_start)) } to { adminShortDate(week2_start) }</th>
                <th>{ adminShortDate(dayPlus1(week2_start)) } to { adminShortDate(week1_start) }</th>
                <th>{ adminShortDate(dayPlus1(week1_start)) } to now</th>
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
          <small>Total Profiles: { dashboardData?.all }</small>&emsp;
          <small>Last 4 weeks: { filter_4weekstotal.length }</small>
          <br />
          <h3>New Profiles (last 4 weeks)</h3>
          {
            filter_4weekstotal && 
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th style={{minWidth: "250px"}}>Name</th>
                  <th>Hear About Us/Affiliate</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
              { filter_4weekstotal.map((item, index) => {
                const createdDate = new Date(item?.createdAt);
                return (
                <tr key={index} className={ item.active ? styles.activeRow : styles.inactiveRow}>
                  <td><small>{item.active ? "Active" : "Inactive" }</small></td>
                  <td>{ item.name }</td>
                  <td>
                    { item.hearaboutus && 
                    <div><small>Hear About Us: {item.hearaboutus}</small></div>
                    }
                    { item.affiliate && 
                    <div><small>Affiliate: {item.affiliate}</small></div>
                    }
                  </td>
                  <td><small>{ createdDate.toLocaleDateString() } { createdDate.toLocaleTimeString() }</small></td>
                  <td>
                    { item.active && 
                    <Link href={`/profile/${item.slug}`}><a target="_blank"rel="noreferrer">View</a></Link>
                    }
                    { !item.active && 
                    <button className="linkButton" onClick={(e: any) => {resendSubmission(e, item.email)}}>Resend</button>
                    }
                  </td>
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

