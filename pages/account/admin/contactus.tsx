import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';

import { IconCircle, IconCircleCheck } from '@tabler/icons';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ContactUsInterface, Pagination } from '@/lib/interfaces';
import { standardizeDateTime } from '@/lib/standardized';
import PanaButton from '@/components/PanaButton';
import AdminButton from '@/components/Admin/AdminButton';
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

const Account_Admin_ContactUs: NextPage = () => {
  const { data: session } = useSession();
  const [page_number, setPageNumber] = useState(1);
  const [submissions_list, setSubmissionsList] = useState([]);
  const [pagination, setPagination] = useState({} as Pagination);

  function createListElements() {
    const elements = submissions_list.map((item: ContactUsInterface, index) => {
      return (
        <div key={index} className={styles.submissionListItem}>
          <div className={styles.submissionListRow}>
            <div className={styles.submissionFieldsInternal}>
                { !item.acknowledged && 
                  <div>
                    <IconCircle height="20" width="20" color="white" />
                  </div>
                }
                { item.acknowledged &&
                  <div>
                    <IconCircleCheck height="20" width="20" color="green" />
                  </div>
                }
              <div>Created: {standardizeDateTime(item?.createdAt)}</div>
              <div>Updated: {standardizeDateTime(item?.updatedAt)}</div>
                { !item.acknowledged && 
                  <div className={styles.submissionFieldsAction}>
                    <AdminButton>Acknowledge</AdminButton>
                  </div>
                }

            </div>
            <div className={styles.submissionListField}><label>Name</label>&emsp;{item?.name}</div>
            <div className={styles.submissionListField}><label>Email</label>&emsp;{item?.email}</div>
            <div className={styles.submissionListField}><label>Message</label>&emsp;{item?.message}</div>
          </div>
        </div>
      );
    });
    return elements;
  }

  useEffect(() => {
    const params = new URLSearchParams()
      .append("page", page_number.toString());
    axios
    .get(
        `/api/getContactUsList?${params}`,
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        }
    ).then((resp) => {
      setSubmissionsList(resp.data.data);
      setPagination(resp.data.pagination);
      return resp;
    })
    .catch((error) => {
        console.log(error);
        return [];
    });
    
  }, [page_number]);

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="Contact Us Submissions | Admin" desc="" />
        <AdminMenu />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Contact Us Submissions</h2>
          <div className={styles.accountForm}>
            <div className={styles.submissionList}>
                {createListElements()}
            </div>
            <p>
              <small>&emsp;[Page: {pagination?.page_number}]&emsp;</small>
              <AdminButton 
                onClick={() => setPageNumber(page_number - 1)} 
                disabled={pagination?.page_number == 1}
                >Previous</AdminButton>
              <AdminButton
                onClick={() => setPageNumber(page_number + 1)} 
                disabled={(pagination?.page_number == pagination.total_pages)}
                >Next</AdminButton>
            </p>
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

export default Account_Admin_ContactUs;

