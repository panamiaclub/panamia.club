import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import { IconEdit } from '@tabler/icons';
import Link from 'next/link';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { getUserSession, saveUserSession } from '@/lib/user_management';
import { ProfileInterface, ProfileSocialsInterface, ProfileStatusInterface, PronounsInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';

export const getServerSideProps: GetServerSideProps = async function (context) {
  return {
    props: {
      session: await getServerSession(
        context.req,
        context.res,
        authOptions
      ),
      session_user: await getUserSession(),
    },
  }
}

const Account_Profile: NextPage = (session_user) => {
  console.log(session_user);
  const { data: session } = useSession();
  // from session
  const [session_email, setSessionEmail] = useState("");
  const [session_zipCode, setSessionZipCode] = useState("");
  const [session_name, setSessionName] = useState("");
  // from profile
  const [has_profile, setHasProfile] = useState(false);
  const [profile_data, setProfileData] = useState({} as ProfileInterface);
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

  function displayPronouns(pronouns: PronounsInterface) {
    if (pronouns.none) {
      return "";
    }
    let pronounArray = [];
    if (pronouns.sheher) {
      pronounArray.push("She/Her");
    }
    if (pronouns.hehim) {
      pronounArray.push("He/Him");
    }
    if (pronouns.theythem) {
      pronounArray.push("They/Them");
    }
    if (pronouns.other) {
      pronounArray.push(pronouns.other_desc);
    }
    return pronounArray.join(",")
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
      const profile = (resp?.data?.data as ProfileInterface);
      console.log(profile); 
      if (profile) {
        setHasProfile(true);
        setProfileData(profile);
        setProfileStatus("Submitted");
        setProfileStatusDate(profile?.status?.submitted?.toString() || "");
        if (profile?.status?.published && profile?.active) {
          setProfileStatus("Published");
          setProfileStatusDate(profile?.status?.published?.toString() || "");
        }
      }
      
    });
  
  }, []);

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="User Account Settings" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Your Pana Profile</h2>
          <p>Status: {profile_status} {profile_status_date}</p>
          <fieldset className={styles.profileFieldset}>
            <legend>Contact Info</legend>
            <div className={styles.profileFields}>
              <label>Email:</label>&emsp;<span>{profile_data?.email}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Phone Number:</label>&emsp;<span>{profile_data?.phone_number}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Pronouns:</label>&emsp;<span>{( profile_data.pronouns ? displayPronouns(profile_data.pronouns) : '')}</span>
            </div>
          </fieldset>
        </div>
      </main>
    )
  }
  return (
    <Status401_Unauthorized />
  )
}

export default Account_Profile;

