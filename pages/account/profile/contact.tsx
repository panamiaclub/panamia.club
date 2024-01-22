import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent, useRef, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useQueryClient, dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, useMutateProfileContact, fetchProfile  } from '@/lib/query/profile';
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

const Account_Profile_Contact: NextPage = (props: any) => {
  console.log("Account_Profile_Contact");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();

  const queryClient = useQueryClient();
  
  const mutation = useMutateProfileContact();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);
  const [otherdesc, setOtherDesc] = useState(profile?.pronouns?.other);

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const updates = {
      email: formData.get("email"),
      phone_number: formData.get("phone_number"),
      pronouns: {
        sheher: formData.get("pronouns_sheher") ? true : false,
        hehim: formData.get("pronouns_hehim") ? true : false,
        theythem: formData.get("pronouns_theythem") ? true : false,
        none: formData.get("pronouns_none") ? true : false,
        other: formData.get("pronouns_other") ? true : false,
        other_desc: formData.get("pronouns_otherdesc"),
      }
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
    <PageMeta title="Contact Info | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Contact Info</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <p>
          <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
        </p>
        <div className={styles.accountFields}>
          <label>Email</label>&emsp;
          <input name="email" type="email" defaultValue={profile.email} disabled />
          <small>Used for contacting you, not displayed on profile</small>
        </div>
        <div className={styles.accountFields}>
          <label>Phone Number</label>&emsp;
          <input name="phone_number" type="text" defaultValue={profile.phone_number} />
          <small>Used for contacting you, not displayed on profile</small>
        </div>
        <div className={styles.accountFields}>
          <label>Pronouns:</label>&emsp;
          <ul>
            <li>
                <label>
                <input type="checkbox" name="pronouns_sheher" value="she/her" 
                defaultChecked={profile.pronouns?.sheher ? true : false} />
                &emsp;She/Her</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_hehim" value="he/him" 
                defaultChecked={profile.pronouns?.hehim ? true : false} />
                &emsp;He/Him</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_theythem" value="they/them" 
                defaultChecked={profile.pronouns?.theythem ? true : false} />
                &emsp;They/Them</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_none" value="no preference" 
                defaultChecked={profile.pronouns?.none ? true : false} />
                &emsp;No Preference</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_other" value="other" 
                defaultChecked={profile.pronouns?.other ? true : false}
                onChange={(e) => {setOtherDesc(!e.target.checked)}} />
                &emsp;Other:</label>
                <input type="text" name="pronouns_otherdesc"
                hidden={otherdesc}
                defaultValue={profile.pronouns?.other_desc} />
            </li>
          </ul>
        </div>
        <div className={styles.accountFields}>
          <PanaButton color="blue" type="submit" disabled={isLoading}>Update</PanaButton>
        </div>
      </form>
      </div>
    </main>
  )

}

export default Account_Profile_Contact;

