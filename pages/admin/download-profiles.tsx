import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';

import { IconCircle, IconCircleCheck } from '@tabler/icons';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ContactUsInterface } from '@/lib/interfaces';
import { standardizeDateTime } from '@/lib/standardized';
import AdminButton from '@/components/Admin/AdminButton';
import AdminMenu from '@/components/Admin/AdminHeader';

import { useAdminActiveProfiles, AdminProfileInterface } from '@/lib/query/admin';

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

const Account_Admin_DownloadProfiles: NextPage = () => {
    const { data: session } = useSession();
  
  const { data, isLoading, isError } = useAdminActiveProfiles();

  if (session) {

    const downloadCSV = (data: any) => {
      const csvContent = "data:text/csv;charset=utf-8," +
        "Name,Email,Phone,Handle\n" +
        data.map((profile: AdminProfileInterface) =>
          `"${profile.name}","${profile.email}","${profile.phone}","${profile.handle}"`
        ).join("\n");
  
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "allProfiles.csv");
      document.body.appendChild(link);
      link.click();
    };
    

    return (
      <main className={styles.app}>
        <PageMeta title="Download Profiles | Admin" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Download Profiles</h2>
          <div className={styles.accountForm}>
            <h3>All Active Profiles</h3>
            <div className={styles.submissionList}>
                <button onClick={(e:any) => {downloadCSV(data)}}>Download CSV</button>
            </div>
          </div>
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

export default Account_Admin_DownloadProfiles;

