import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent} from 'react';
import { IconArrowBackUp, IconDeviceFloppy } from '@tabler/icons';
import { dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { CategoryInterface, ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, useMutateProfileCategories  } from '@/lib/query/profile';
import Spinner from '@/components/Spinner';
import { serialize } from '@/lib/standardized';
import FullPage from '@/components/Page/FullPage';
import { profileCategoryList } from '@/lib/lists';

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

const Account_Profile_Categories: NextPage = (props: any) => {
  console.log("Account_Profile_Categories");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();
  
  const mutation = useMutateProfileCategories();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    let categories: {[k: string]: any} = {};
    profileCategoryList.forEach((item) => {
      categories[item.value] = formData.get(item.value) ? true : false;
    });
    const updates = {
      categories: categories,
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
    <PageMeta title="Categories | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Categories</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <div className={styles.accountFormActions}>
          <PanaButton href="/account/profile/edit" compact={true}><IconArrowBackUp size={18} /> Back</PanaButton>
          <PanaButton color="blue" type="submit" disabled={isLoading} compact={true}><IconDeviceFloppy size={18} /> Save Changes</PanaButton>
        </div>
        <div className={styles.accountFields}>
          <p className={styles.accountNote}>Select the categories that best match your 
          profile, these will help users find your profile.</p>
        </div>
        <div className={styles.accountFields}>
          <label>Categories:</label>&emsp;
          <ul>
            {
              profileCategoryList.map((item: {desc: string, value: string}, index: number) => {
                return (
                  <li key={index}>
                      <label>
                      <input type="checkbox" name={item.value} value={item.value} 
                      defaultChecked={profile.categories[item.value  as keyof CategoryInterface] ? true : false} />
                      &emsp;{item.desc}</label>
                  </li>
                )
              })
            }
          </ul>
        </div>
      </form>
      </div>
    </main>
  )

}

export default Account_Profile_Categories;

