import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent,} from 'react';
import { IconArrowBackUp, IconDeviceFloppy } from '@tabler/icons';
import { useQueryClient, dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, useMutateProfileSocial, fetchProfile  } from '@/lib/query/profile';
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

const Account_Profile_Social: NextPage = (props: any) => {
  console.log("Account_Profile_Social");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();
  
  const mutation = useMutateProfileSocial();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const updates = {
      socials: {
        website: formData.get("website"),
        facebook: formData.get("facebook"),
        instagram: formData.get("instagram"),
        tiktok: formData.get("tiktok"),
        twitter: formData.get("twitter"),
        spotify: formData.get("spotify"),
      },
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
    <PageMeta title="Profile Socials | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Links and Socials</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <div className={styles.accountFormActions}>
          <PanaButton href="/account/profile/edit" compact={true}><IconArrowBackUp size={18} /> Back</PanaButton>
          <PanaButton color="blue" type="submit" disabled={isLoading} compact={true}><IconDeviceFloppy size={18} /> Save Changes</PanaButton>
        </div>
        <div className={styles.accountFields}>
          <label>Website</label>&emsp;
          <input name="website" type="text" defaultValue={profile.socials.website} />
        </div>
        <div className={styles.accountFields}>
          <label>Facebook</label>&emsp;
          <input name="facebook" type="text" defaultValue={profile.socials.facebook} />
        </div>
        <div className={styles.accountFields}>
          <label>Instagram</label>&emsp;
          <input name="instagram" type="text" defaultValue={profile.socials.instagram} />
        </div>
        <div className={styles.accountFields}>
          <label>Tiktok</label>&emsp;
          <input name="tiktok" type="text" defaultValue={profile.socials.tiktok} />
        </div>
        <div className={styles.accountFields}>
          <label>Twitter</label>&emsp;
          <input name="twitter" type="text" defaultValue={profile.socials.twitter} />
        </div>
        <div className={styles.accountFields}>
          <label>Spotify</label>&emsp;
          <input name="spotify" type="text" defaultValue={profile.socials.spotify} />
        </div>
        
        <div className={styles.accountFields}>
          <PanaButton color="blue"type="submit" disabled={isLoading}>Update</PanaButton>
        </div>
      </form>
      </div>
    </main>
  )

}

export default Account_Profile_Social;

