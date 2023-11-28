import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent } from 'react';
import Link from 'next/link';
import { dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, mutateProfileDesc, fetchProfile  } from '@/lib/query/profile';
import Spinner from '@/components/Spinner';
import { serialize } from '@/lib/standardized';
import FullPage from '@/components/Page/FullPage';


export const getServerSideProps: GetServerSideProps = async function (context) {
  const queryClient = new QueryClient()
  const session = await getServerSession( context.req, context.res, authOptions );
  const userLib = await import("@/lib/server/user");
  const session_user = (session) ? serialize(await userLib.getUser(session.user.email)) : null;
  const profileLib = await import("@/lib/server/profile");
  await queryClient.prefetchQuery({
      queryKey: profileQueryKey,
      initialData: serialize(await profileLib.getProfile(session.user.email)),
  });
  return {
    props: {
      session: session,
      session_user: session_user,
      dehydratedState: dehydrate(queryClient),
    },
  }
}

const Account_Profile_Desc: NextPage = (props: any) => {
  console.log("Account_Profile_Desc");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();
  
  const mutation = mutateProfileDesc();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const updates = {
      name: formData.get("name"),
      five_words: formData.get("five_words"),
      details: formData.get("details"),
      background: formData.get("background"),
      tags: formData.get("tags"),
    }
    mutation.mutate(updates);
  }

  console.log("status", isLoading, data);

  if (!session) {
    return ( <Status401_Unauthorized /> )
  }

  if (!profile) {
    return ( <FullPage><Spinner /></FullPage> );
  }

  return (
    <main className={styles.app}>
    <PageMeta title="Profile Description | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Profile Description</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <p>
          <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
        </p>
        <div className={styles.accountFields}>
          <label>Name</label>&emsp;
          <input name="name" type="text" defaultValue={profile.name} />
        </div>
        <div className={styles.accountFields}>
          <label>Five Words</label>&emsp;
          <input name="five_words" type="text" defaultValue={profile.five_words} />
        </div>
        <div className={styles.accountFields}>
          <label>Details</label>&emsp;
          <textarea name="details" rows={4} maxLength={500} defaultValue={profile.details}></textarea>
        </div>
        <div className={styles.accountFields}>
          <label>Background</label>&emsp;
          <textarea name="background" rows={4} maxLength={500} defaultValue={profile.background}></textarea>
        </div>
        <div className={styles.accountFields}>
          <label>Tags</label>&emsp;
          <textarea name="tags" rows={4} maxLength={500} defaultValue={profile.tags}></textarea>
        </div>
        
        <div className={styles.accountFields}>
          <PanaButton color="blue" submit={true} disabled={isLoading}>Update</PanaButton>
        </div>
      </form>
      </div>
    </main>
  )

}

export default Account_Profile_Desc;

