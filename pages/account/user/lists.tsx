import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { FormEvent } from 'react';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import PanaButton from '@/components/PanaButton';
import { UserlistInterface } from '@/lib/interfaces';
import { useMutateUserLists, useUser, useUserFollowing, useUserLists } from '@/lib/query/user';
import PanaLinkButton from '@/components/PanaLinkButton';

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

const Account_User_Edit: NextPage = () => {
  const { data: session } = useSession();
  // from session
  const { data: userData } = useUser();
  const { data: userlistsData } = useUserLists();
  const userMutation = useMutateUserLists();

  const deleteList = (e: FormEvent, id: string) => {
    e.preventDefault();
    // TODO: CONFIRM DELETE
    const updates = {
      action: "delete",
      id: id,
    }
    userMutation.mutate(updates);
  }

  let userlistElements = [<div key="0"></div>];
  if (userlistsData && userlistsData.length > 0) {
    console.log("userlistsData", userlistsData);
    userlistElements = userlistsData.map((item: UserlistInterface, index) => {
      return (
        <article className={styles.profileListCard} key={index}>
          <div className={styles.listCardName}>
            {item.name}
          </div>
          <div><small>{item.profiles.length} profiles</small></div>
          <div className={styles.listCardAction}>
            <Link href={`/list/${item._id}`}><a target="_blank">View</a></Link>&emsp;
            <PanaLinkButton onClick={(e:any) => {deleteList(e, item._id)}}>Delete</PanaLinkButton>
          </div>
        </article>
      ) });
  } else {
    userlistElements = [(
      <article className={styles.profileListEmpty} key={0}>
        <div>You haven't created any lists yet</div>
      </article>
    )];
  }
  
  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="User Account | Profiles Your Follow" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>My Lists</h2>
          <div className={styles.accountForm}>
            <div className={styles.accountFields}>
              { userlistElements }
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

export default Account_User_Edit;

