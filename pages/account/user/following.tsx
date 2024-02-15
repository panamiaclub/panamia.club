import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { getUserSession, saveUserSession } from '@/lib/user';
import PanaButton from '@/components/PanaButton';
import { ProfileInterface, UserInterface } from '@/lib/interfaces';
import { useMutateUserFollowing, useUser, useUserFollowing } from '@/lib/query/user';
import Link from 'next/link';

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
  const { data: followingData } = useUserFollowing();
  const userMutation = useMutateUserFollowing();

  const unfollowProfile = (e: FormEvent, id: string) => {
    e.preventDefault();
    const updates = {
      action: "unfollow",
      id: id,
    }
    userMutation.mutate(updates);
  } 

  let followingElements = [<></>];
  if (followingData && followingData.length > 0) {
    console.log("followingData", followingData);
    followingElements = followingData.map((item: ProfileInterface, index) => {
      return (
        <article className={styles.profileListCard}>
          <div className={styles.listCardImage}>
            { item?.images?.primaryCDN && 
            <img src={item.images?.primaryCDN} /> ||
            <img src="/img/bg_coconut_blue.jpg" />
            }
          </div>
          <div className={styles.listCardName}>
            <Link href={`/profile/${item.slug}`}><a>{item.name}</a></Link>
          </div>
          <div className={styles.listCardAction}>
            <PanaButton compact={true} color="gray"
              onClick={(e:any) => {unfollowProfile(e, item._id)}}
              >Unfollow</PanaButton>
          </div>
        </article>
      ) });
  } else {
    followingElements = [(
      <article className={styles.profileListEmpty}>
        <div>You're not following any profiles yet</div>
      </article>
    )];
  }
  
  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="User Account | Profiles Your Follow" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Profiles You Follow</h2>
          <div className={styles.accountForm}>
            <div className={styles.accountFields}>
              { followingElements }
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

