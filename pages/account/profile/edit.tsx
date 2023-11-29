import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import { IconCategory, IconCheck, IconCheckupList, IconEdit, IconExternalLink, IconMapPin, IconPhoto, IconUser, IconUserCircle, IconUsers, IconX } from '@tabler/icons';
import Link from 'next/link';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { getUserSession, saveUserSession } from '@/lib/user';
import { ProfileInterface } from '@/lib/interfaces';
import { displayPronouns, standardizeDateTime } from '@/lib/standardized';
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
    // console.log("updateUserSession:response", response);
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
      // console.log(profile); 
      if (profile) {
        setHasProfile(true);
        setProfileData(profile);
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
        <PageMeta title="Edit Profile" desc="" />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Your Pana Profile</h2>
          <fieldset className={styles.profileFieldset}>
            <legend><IconCheckupList /> Profile Status</legend>
            <div className={styles.profileEditLink}>
              { profile_data.slug && 
              <Link href={`/profile/${profile_data.slug}`}><a><IconExternalLink height="20" /> View</a></Link>
              }
            </div>
            <div className={styles.profileFields}>
              <label>Status:</label>&emsp;<span>{profile_status} {profile_status_date}</span>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconUser /> Contact Info</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/contact"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
            <div className={styles.profileFields}>
              <label>Email:</label>&emsp;<span>{profile_data?.email}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Phone Number:</label>&emsp;<span>{profile_data?.phone_number}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Pronouns:</label>&emsp;<span>{displayPronouns(profile_data.pronouns)}</span>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconUserCircle /> Profile Descriptions</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/desc"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
            <div className={styles.profileFields}>
              <label>Name:</label>&emsp;<span>{profile_data?.name}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Five Words:</label>&emsp;<span>{profile_data?.five_words}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Details:</label>&emsp;<span>{profile_data?.details}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Background:</label>&emsp;<span>{profile_data?.background}</span>
            </div>
            <div className={styles.profileFields}>
              <label>Tags:</label>&emsp;
              {profile_data?.tags &&
              <span>{profile_data?.tags}</span> ||
              <span className={styles.profileFieldBlank}>blank</span>}
            </div>
            <div className={styles.profileFields}>
              <div className={styles.profileNote}>
                <div>handle: /profile/{profile_data?.slug}</div>
                <div>This is the url for your profile, please contact us if it is incorrect</div>
              </div>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconExternalLink /> Links and Socials</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/social"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
            <div className={styles.profileFields}>
              <label>Socials:</label><br />
              <ul>
                <li>
                  <span>Website:</span>&emsp;
                  {profile_data?.socials?.website &&
                  <span>{profile_data?.socials?.website}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>Instagram:</span>&emsp;
                  {profile_data?.socials?.instagram &&
                  <span>{profile_data?.socials?.instagram}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                  </li>
                <li>
                  <span>Facebook:</span>&emsp;
                  {profile_data?.socials?.facebook &&
                  <span>{profile_data?.socials?.facebook}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>TikTok:</span>&emsp;
                  {profile_data?.socials?.tiktok &&
                  <span>{profile_data?.socials?.tiktok}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>Twitter:</span>&emsp;
                  {profile_data?.socials?.twitter &&
                  <span>{profile_data?.socials?.twitter}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>Spotify:</span>&emsp;
                  {profile_data?.socials?.spotify &&
                  <span>{profile_data?.socials?.spotify}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
              </ul>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconMapPin /> Address and GeoLocation</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/address"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
            <div className={styles.profileFields}>
              <label>Primary Address:</label><br />
              <ul>
                <li>
                  <span>Street 1:</span>&emsp;
                  {profile_data?.primary_address?.street1 &&
                  <span>{profile_data?.primary_address?.street1}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>Street 2:</span>&emsp;
                  {profile_data?.primary_address?.street2 &&
                  <span>{profile_data?.primary_address?.street2}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>City:</span>&emsp;
                  {profile_data?.primary_address?.city &&
                  <span>{profile_data?.primary_address?.city}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>State:</span>&emsp;
                  {profile_data?.primary_address?.state &&
                  <span>{profile_data?.primary_address?.state}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>Zip Code:</span>&emsp;
                  {profile_data?.primary_address?.zipcode &&
                  <span>{profile_data?.primary_address?.zipcode}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
                <li>
                  <span>Location Hours:</span>&emsp;
                  {profile_data?.primary_address?.hours &&
                  <span>{profile_data?.primary_address?.hours}</span> ||
                  <span className={styles.profileFieldBlank}>blank</span>}
                </li>
              </ul>
            </div>
            <div className={styles.profileFields}>
              <label>Geo Coordinates:</label><br />
              <ul>
                <li>
                  <span>Latitude:</span>&emsp;
                  <span className={styles.profileFieldBlank}>blank</span>
                </li>
                <li>
                  <span>Longitude:</span>&emsp;
                  <span className={styles.profileFieldBlank}>blank</span>
                </li>
              </ul>
            </div>
            <div className={styles.profileFields}>
              <label>Servicing Counties:</label><br />
              <ul>
                <li>
                  <span>Palm Beach:</span>&emsp;
                  {profile_data?.counties?.palm_beach &&
                   <IconCheck color="green" /> ||
                   <span className={styles.profileFieldBlank}>unselected</span>}
                  </li>
                <li>
                  <span>Broward:</span>&emsp;
                  {profile_data?.counties?.broward && 
                  <IconCheck color="green" /> || 
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Miami-Dade:</span>&emsp;
                  {profile_data?.counties?.miami_dade &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
              </ul>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconCategory /> Categories</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/categories"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
            <div className={styles.profileFields}>
              <label>Categories:</label><br />
              <ul>
                <li>
                  <span>Products:</span>&emsp;
                  {profile_data?.categories?.products &&
                   <IconCheck color="green" /> ||
                   <span className={styles.profileFieldBlank}>unselected</span>}
                  </li>
                <li>
                  <span>Services:</span>&emsp;
                  {profile_data?.categories?.services && 
                  <IconCheck color="green" /> || 
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Events:</span>&emsp;
                  {profile_data?.categories?.events &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Music:</span>&emsp;
                  {profile_data?.categories?.music &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Food:</span>&emsp;
                  {profile_data?.categories?.food &&
                   <IconCheck color="green" /> ||
                   <span className={styles.profileFieldBlank}>unselected</span>}
                  </li>
                <li>
                  <span>Clothing:</span>&emsp;
                  {profile_data?.categories?.clothing && 
                  <IconCheck color="green" /> || 
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Accessories:</span>&emsp;
                  {profile_data?.categories?.accessories &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Art:</span>&emsp;
                  {profile_data?.categories?.art &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Digital Art:</span>&emsp;
                  {profile_data?.categories?.digital_art &&
                   <IconCheck color="green" /> ||
                   <span className={styles.profileFieldBlank}>unselected</span>}
                  </li>
                <li>
                  <span>Tech:</span>&emsp;
                  {profile_data?.categories?.tech && 
                  <IconCheck color="green" /> || 
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Health &amp; Beauty:</span>&emsp;
                  {profile_data?.categories?.health_beauty &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Spiritual:</span>&emsp;
                  {profile_data?.categories?.spiritual &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Non-Profit:</span>&emsp;
                  {profile_data?.categories?.non_profit &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
                <li>
                  <span>Homemade:</span>&emsp;
                  {profile_data?.categories?.homemade &&
                  <IconCheck color="green" /> ||
                  <span className={styles.profileFieldBlank}>unselected</span>}
                </li>
              </ul>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconPhoto /> Images</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/contact"><a><IconEdit height="20" /> Edit</a></Link>
            </div>
          </fieldset>
          <fieldset className={styles.profileFieldset}>
            <legend><IconUsers /> Linked Profiles</legend>
            <div className={styles.profileEditLink}>
              <Link href="/account/profile/contact"><a><IconEdit height="20" /> Edit</a></Link>
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

