import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import { IconEdit } from '@tabler/icons';
import Link from 'next/link';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { getUserSession, saveUserSession } from '@/lib/user';
import PanaButton from '@/components/PanaButton';

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

const Account_User: NextPage = () => {
  const { data: session } = useSession();
  // from session
  const [session_email, setSessionEmail] = useState("");
  const [session_zipCode, setSessionZipCode] = useState("");
  const [session_name, setSessionName] = useState("");
  // from profile
  const [has_profile, setHasProfile] = useState(false);
  const [profile_name, setProfileName] = useState("");
  const [profile_status, setProfileStatus] = useState("");
  const [profile_status_date, setProfileStatusDate] = useState("");

  const setUserSession = async() => {
    const userSession = await getUserSession();
    if (userSession) {
      setSessionEmail(userSession.email == null ? '' : userSession.email);
      setSessionZipCode(userSession.zip_code == null ? '' : userSession.zip_code);
      setSessionName(userSession.name == null ? '' : userSession.name);
    }
  }

  const updateUserSession = async() => {
    const response = await saveUserSession({
      name: session_name,
      zip_code: session_zipCode,
    });
    console.log("updateUserSession:response", response);
  }

  function onZipCodeChange(e: FormEvent) {
    const zipCodeChange = (e.target as HTMLInputElement).value
    if (e.target) setSessionZipCode(zipCodeChange);
  }

  function onNameChange(e: FormEvent) {
    const nameChange = (e.target as HTMLInputElement).value
    if (e.target) setSessionName(nameChange);
  }

  function onUpdateClick(e: FormEvent) {
    updateUserSession();
  }

  async function loadProfile() {
    const profile = await axios
    .get(
        "/api/getProfile",
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        }
    )
    .catch((error) => {
        console.log(error);
    });
    return profile;
  }

  useEffect(() => {
    setUserSession();
    loadProfile().then((resp) => { 
      const profile = resp?.data?.data;
      // console.log(profile); 
      if (profile) {
        setHasProfile(true);
        setProfileName(profile.name)
        setProfileStatus("Submitted");
        setProfileStatusDate(profile?.status?.submitted);
        if (profile?.status?.published && profile?.active) {
          setProfileStatus("Published");
          setProfileStatusDate(profile?.status?.published);
        }
      }
      
    });
  
  }, []);

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="User Account Settings" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Update Your Account Settings</h2>
          { has_profile &&
          <div id="pana-profile-bar">
            <div className={styles.accountProfileBar}>
              <div className={styles.profileBarHighlight}>Pana Profile</div>
              <div className={styles.profileBarName}>{profile_name}</div>
              <div className={styles.profileBarEdit}><Link href="/account/profile/edit"><a><IconEdit height="18" width="18" /><span>Edit</span></a></Link></div>
            </div>
            <small className={styles.profileBarStatus}>Status: {profile_status} {profile_status_date}</small>
          </div>
          }
          { !has_profile &&
          <div id="pana-signup-bar">
            <div className={styles.accountProfileSignup}>
              <p>Ready to Become a Pana? <Link href="/form/become-a-pana/">Create your profile</Link> to showcase your creative talents or business!</p>
            </div>
          </div>
          }
          <div className={styles.accountForm}>
            <div className={styles.accountFields}>
              <label>Email:</label><br />
              <input type="text" value={session_email} readOnly disabled />
              <small>You can't change your signed-in email address.</small>
            </div>
            <div className={styles.accountFields}>
              <label>Name/Nickname:</label><br />
              <input 
                type="text" 
                value={session_name} 
                maxLength={60}
                autoComplete='name'
                onChange={onNameChange} />
              <small>Used for contact emails and notices.</small>
            </div>
            <div className={styles.accountFields}>
              <label>Zip Code:</label><br />
              <input 
                type="text" 
                value={session_zipCode} 
                maxLength={10}
                autoComplete='postal-code'
                onChange={onZipCodeChange} />
              <small>Used to personalize search results and site features.</small>
            </div>
            <PanaButton onClick={onUpdateClick} text="Update" color="blue" />
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

export default Account_User;

