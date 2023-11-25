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
import { getUserSession } from '@/lib/user_management';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { getProfile, mutateProfileContact, fetchProfile  } from './queries';
import Spinner from '@/components/Spinner';


export const getServerSideProps: GetServerSideProps = async function (context) {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({queryKey: ['profile'], queryFn: () => fetchProfile()})

  return {
    props: {
      session: await getServerSession(
        context.req,
        context.res,
        authOptions
      ),
      session_user: await getUserSession(),
      dehydratedState: dehydrate(queryClient),
    },
  }
}

const FormHandler = () => {
  console.log("FormHandler");
  const queryClient = useQueryClient();
  
  const mutation = mutateProfileContact();
  const { data, isLoading, isError } = getProfile();
  const profile = (data as ProfileInterface);
  const [otherdesc, setOtherDesc] = useState(profile.pronouns?.other);

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
  
  if (profile) {
    return (
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <p>
          <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
        </p>
        <div className={styles.accountFields}>
          <label>Email</label>&emsp;
          <input name="email" type="email" defaultValue={profile.email} />
        </div>
        <div className={styles.accountFields}>
          <label>Phone Number</label>&emsp;
          <input name="phone_number" type="text" defaultValue={profile.phone_number} />
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
          <PanaButton color="blue" submit={true}>Update</PanaButton>
        </div>
      </form>
    )
  }
  return ( <div><Spinner /></div> );

}

const Account_Profile_Contact: NextPage = (props: any) => {
  console.log("Account_Profile_Contact");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="Contact Information | Edit Profile" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Profile - Edit Contact Info</h2>
          <FormHandler />
        </div>
      </main>
    )
  }
  return (
    <Status401_Unauthorized />
  )
}

export default Account_Profile_Contact;

