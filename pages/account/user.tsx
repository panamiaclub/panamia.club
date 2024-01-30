import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import { IconCopy, IconEdit, IconUser } from '@tabler/icons';
import Link from 'next/link';

import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { getUserSession, saveUserSession } from '@/lib/user';
import PanaButton from '@/components/PanaButton';
import { standardizeDateTime } from '@/lib/standardized';
import { UserInterface } from '@/lib/interfaces';

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

function copyAffiliateLink(e: any, code: string) {
  e.preventDefault();
  const permissionName = "clipboard-write" as PermissionName;
  navigator.permissions.query({name: permissionName}).then((result) => {
    if (result.state === "granted" || result.state === "prompt") {
      navigator.clipboard.writeText(`https://panamia.club/affiliate?code=${code}`);
      alert('Copied to clipboard');
    }
  });
}

const Account_User: NextPage = () => {
  const { data: session } = useSession();
  // from session
  const [session_email, setSessionEmail] = useState("");
  const [session_zipCode, setSessionZipCode] = useState("");
  const [session_name, setSessionName] = useState("");
  const [userData, setUserData] = useState({} as UserInterface);
  // from profile
  const [has_profile, setHasProfile] = useState(false);
  const [has_affiliate, setHasAffilate] = useState(false);
  const [profile_name, setProfileName] = useState("");
  const [profile_status, setProfileStatus] = useState("");
  const [profile_status_date, setProfileStatusDate] = useState("");

  const setUserSession = async() => {
    const userSession = await getUserSession();
    if (userSession) {
      setSessionEmail(userSession.email == null ? '' : userSession.email);
      setSessionZipCode(userSession.zip_code == null ? '' : userSession.zip_code);
      setSessionName(userSession.name == null ? '' : userSession.name);
      setUserData(userSession);
      if (userData?.affiliate?.activated) {
        setHasAffilate(true);
      }
    }
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
        setProfileStatusDate(standardizeDateTime(profile?.status?.submitted));
        if (profile?.status?.published && profile?.active) {
          setProfileStatus("Published");
          setProfileStatusDate(standardizeDateTime(profile?.status?.published));
        }
      }
      
    });
  
  }, []);

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="User Account Settings" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>User Account</h2>
          <br />
          <fieldset className={styles.profileFieldset}>
            <legend><IconUser /> Account Info</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/user/edit"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
            <div className={styles.profileFields}>
              <label>Email:</label>&emsp;<span>{userData?.email}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Name/Nickname:</label>&emsp;<span>{userData?.name}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Zip Code:</label>&emsp;<span>{userData?.zip_code}</span>
            </div>
          </fieldset>
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
              <p>Ready to Become a Pana? <span style={{color:"#FA2F60 !important"}}><Link href="/form/become-a-pana/">Create your profile</Link></span> to showcase your creative talents or business!</p>
            </div>
          </div>
          }
          { userData?.affiliate?.activated &&
          <div id="pana-affiliate-bar">
            <div className={styles.affiliateBar}>
              <div className={styles.affiliateBarHighlight}>ComPana</div>
              <div className={styles.affiliateBarDetails}>
                <div className={styles.affiliateBarCode}>{userData?.affiliate?.code}</div>
                <div className={styles.affiliateBarLink}>
                  <a href={`https://panamia.club/affiliate?code=${userData?.affiliate?.code}`}
                    onClick={(e) => {copyAffiliateLink(e, userData.affiliate.code)}}>
                    <IconCopy height="18" />Share Link
                  </a>
                </div>
                <div className={styles.affiliateBarPoints} hidden>{userData?.affiliate?.points ? userData.affiliate.points : "0"}&nbsp;points</div>
                <div className={styles.affiliateBarView}></div>
              </div>
            </div>
          </div>
          }
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

