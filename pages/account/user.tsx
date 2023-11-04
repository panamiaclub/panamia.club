import type { NextPage } from 'next';
import { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';

import styles from '../../styles/account/User.module.css';
import PageMeta from '../../components/PageMeta';
import { getUserSession, saveUserSession } from '../../lib/user_management';

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

const User: NextPage = () => {
  const { data: session } = useSession();
  const [session_email, setSessionEmail] = useState("");
  const [session_zipCode, setSessionZipCode] = useState("");
  const [session_name, setSessionName] = useState("");

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

  useEffect(() => {
    setUserSession();
  }, []);

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="User Account Settings" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Update Your Account Settings</h2>
          <div className={styles.accountForm}>
            <div className={styles.accountFields}>
              <label>Email:</label><br />
              <input type="text" value={session_email} disabled />
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
            <button onClick={onUpdateClick}>Update</button>
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

export default User;

