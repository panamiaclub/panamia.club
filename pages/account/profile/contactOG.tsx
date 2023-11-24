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
import { ProfileInterface, PronounsInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';

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

const Account_Profile_Contact: NextPage = (session_user) => {
  const { data: session } = useSession();
  // from session
  const [email, setEmail] = useState("");
  const [phone_number, setPhoneNumber] = useState("");
  const [pronouns_sheher, setPronounsSheher] = useState(false);
  const [pronouns_hehim, setPronounsHehim] = useState(false);
  const [pronouns_theythem, setPronounsTheythem] = useState(false);
  const [pronouns_none, setPronounsNone] = useState(false);
  const [pronouns_other, setPronounsOther] = useState(false);
  const [pronouns_otherdesc, setPronounsOtherdesc] = useState("");

  // from profile
  const [profile_data, setProfileData] = useState({} as ProfileInterface);

  async function saveProfile() {
    const profile = await axios
    .post(
        "/api/profile/saveContact",
        {
          email: email,
          phone_number: phone_number,
          pronouns: {
            sheher: pronouns_sheher,
            hehim: pronouns_hehim,
            theythem: pronouns_theythem,
            none: pronouns_none,
            other: pronouns_other,
            other_desc: pronouns_otherdesc,
          }
        },
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
    if (profile?.data?.success) {
      alert('Succesfully updated profile');
    } else {
      alert('Failed to update profile. Please contact us.');
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

  function submitForm(e: FormEvent) {
    e.preventDefault();
    saveProfile();
  }

  useEffect(() => {
    loadProfile().then((resp) => { 
      const profile = (resp?.data?.data as ProfileInterface);
      if (profile) {
        setProfileData(profile);
        setEmail(profile.email);
        setPhoneNumber(profile.phone_number);
        setPronounsSheher(profile.pronouns?.sheher ? true : false);
        setPronounsHehim(profile.pronouns?.hehim ? true : false);
        setPronounsTheythem(profile.pronouns?.theythem ? true : false);
        setPronounsNone(profile.pronouns?.none ? true : false);
        setPronounsOther(profile.pronouns?.other ? true : false);
        if (profile.pronouns && profile.pronouns.other_desc) {
          setPronounsOtherdesc(profile.pronouns.other_desc);
        }
      }
    });
  }, []);

  if (session) {
    return (
      <main className={styles.app}>
        <PageMeta title="Contact Information | Edit Profile" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Profile - Edit Contact Info</h2>
          <form className={styles.accountForm} onSubmit={submitForm}>
            <p>
              <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
            </p>
            <div className={styles.accountFields}>
              <label>Email</label>&emsp;
              <input type="email" value={email} />
            </div>
            <div className={styles.accountFields}>
              <label>Phone Number</label>&emsp;
              <input type="text" value={phone_number} />
            </div>
            <div className={styles.accountFields}>
              <label>Pronouns:</label>&emsp;
              <ul>
                <li>
                    <label>
                    <input type="checkbox" name="pronouns_sheher" value="she/her" 
                    checked={pronouns_sheher} onChange={(e:any) => setPronounsSheher(!pronouns_sheher)} />
                    &emsp;She/Her</label>
                </li>
                <li>
                    <label>
                    <input type="checkbox" name="pronouns_hehim" value="he/him" 
                    checked={pronouns_hehim} onChange={(e:any) => setPronounsHehim(!pronouns_hehim)} />
                    &emsp;He/Him</label>
                </li>
                <li>
                    <label>
                    <input type="checkbox" name="pronouns_theythem" value="they/them" 
                    checked={pronouns_theythem} onChange={(e:any) => setPronounsTheythem(!pronouns_theythem)} />
                    &emsp;They/Them</label>
                </li>
                <li>
                    <label>
                    <input type="checkbox" name="pronouns_none" value="no preference" 
                    checked={pronouns_none} onChange={(e:any) => setPronounsNone(!pronouns_none)} />
                    &emsp;No Preference</label>
                </li>
                <li>
                    <label>
                    <input type="checkbox" name="pronouns_other" value="other" 
                    checked={pronouns_other} onChange={(e:any) => setPronounsOther(!pronouns_other)} />
                    &emsp;Other:</label>
                    <input type="text" hidden={!pronouns_other} 
                    value={pronouns_otherdesc} onChange={(e:any) => setPronounsOtherdesc(e.target.value)} />
                </li>
              </ul>
            </div>
            <div className={styles.accountFields}>
              <PanaButton color="blue" submit={true}>Update</PanaButton>
            </div>
          </form>
        </div>
      </main>
    )
  }
  return (
    <Status401_Unauthorized />
  )
}

export default Account_Profile_Contact;

