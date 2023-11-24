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
  const queryClient = useQueryClient();

  const email = useRef<HTMLInputElement>(null);
  const phone_number = useRef<HTMLInputElement>(null);
  const pronouns_sheher = useRef<HTMLInputElement>(null);
  const pronouns_hehim = useRef<HTMLInputElement>(null);
  const pronouns_theythem = useRef<HTMLInputElement>(null);
  const pronouns_none = useRef<HTMLInputElement>(null);
  const pronouns_other = useRef<HTMLInputElement>(null);
  const pronouns_otherdesc = useRef<HTMLInputElement>(null);
  
  const pronouns_otherstate = useRef<boolean>(false);

  const mutation = mutateProfileContact();
  const { data, isLoading, isError } = getProfile();

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const updates = {
      email: email.current ? email.current.value : data?.email,
      phone_number: phone_number.current ? phone_number.current.value : data?.phone_number,
      pronouns: {
        sheher: pronouns_sheher.current ? pronouns_sheher.current.checked : data?.pronouns?.sheher,
        hehim: pronouns_hehim.current ? pronouns_hehim.current.checked : data?.pronouns?.hehim,
        theythem: pronouns_theythem.current ? pronouns_theythem.current.checked : data?.pronouns?.theythem,
        none: pronouns_none.current ? pronouns_none.current.checked : data?.pronouns?.none,
        other: pronouns_other.current ? pronouns_other.current.checked : data?.pronouns?.other,
        other_desc: pronouns_otherdesc.current ? pronouns_otherdesc.current.value : data?.pronouns?.other_desc,
      }
    }
    mutation.mutate(updates);
  }

  console.log("status", isLoading, data);
  const profile = (data as ProfileInterface);
  if (data) {
    const profile = (data as ProfileInterface);
    if (profile.pronouns?.other) {
      pronouns_otherstate.current = (profile.pronouns?.other as boolean)
    }
    
    return (
      <form className={styles.accountForm} onSubmit={submitForm}>
        <p>
          <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
        </p>
        <div className={styles.accountFields}>
          <label>Email</label>&emsp;
          <input type="email" defaultValue={data.email} ref={email} />
        </div>
        <div className={styles.accountFields}>
          <label>Phone Number</label>&emsp;
          <input type="text" defaultValue={data.phone_number} ref={phone_number} />
        </div>
        <div className={styles.accountFields}>
          <label>Pronouns:</label>&emsp;
          <ul>
            <li>
                <label>
                <input type="checkbox" name="pronouns_sheher" value="she/her" 
                defaultChecked={data.pronouns?.sheher ? true : false} ref={pronouns_sheher} />
                &emsp;She/Her</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_hehim" value="he/him" 
                defaultChecked={data.pronouns?.hehim ? true : false} ref={pronouns_hehim} />
                &emsp;He/Him</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_theythem" value="they/them" 
                defaultChecked={data.pronouns?.theythem ? true : false} ref={pronouns_theythem} />
                &emsp;They/Them</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_none" value="no preference" 
                defaultChecked={data.pronouns?.none ? true : false} ref={pronouns_none} />
                &emsp;No Preference</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="pronouns_other" value="other" 
                defaultChecked={data.pronouns?.other ? true : false} ref={pronouns_other} 
                onChange={(e) => {
                  console.log(pronouns_otherstate);
                  pronouns_otherstate.current = e.target.checked;
                  pronouns_otherdesc.current.hidden = !pronouns_otherstate}} />
                &emsp;Other:</label>
                <input type="text" hidden={!pronouns_otherstate.current}
                defaultValue={data.pronouns?.other_desc} ref={pronouns_otherdesc} />
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

