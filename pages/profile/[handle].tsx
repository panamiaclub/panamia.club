import type { NextPage } from 'next'
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { IconExternalLink, IconBrandInstagram, IconBrandFacebook } from '@tabler/icons';

import styles from '@/styles/profile/Profile.module.css'
import PageMeta from '@/components/PageMeta';
import Spinner from '@/components/Spinner';

interface ProfileProps {
  handle: string,
}

const fetchProfile = async (handle: string) => {
  console.log('fetchProfile', handle);
  const params = new URLSearchParams();
  params.append("handle", handle);
  
  const fetchResults = await axios
  .get(
      `/api/getPublicProfile?${params}`,
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
  if (fetchResults) {
    console.log(fetchResults.data.data);
    return fetchResults.data.data;
  }
  return {};
}


const ProfileBody = ({ handle }: ProfileProps) => {
  const { data, isLoading, isFetching, isRefetching, refetch } = useQuery({
    queryKey: ['profilePublic', {handle}],
    queryFn: () => fetchProfile(handle),
  });

  if (data) {
    return (
      <article className={styles.profileCard}>
        <div className={styles.profileHeader}>
          <div className={styles.profileImage}>
            <img src="/img/bg_coconut_blue.jpg" />
          </div>
          <div className={styles.profilePrimary}>
            <h2>{data.name}</h2>
            <p className={styles.profileFiveWords}>{data.five_words}</p>
            <p>{data.details}</p>
          </div>
          <div className={styles.socialLinks}>
            <div>
            { data.socials?.website && 
                <a href={data.socials.website.toString()}>
                  <IconExternalLink height="32" width="32" color="white" />
                </a>
                }
                { data.socials?.instagram && 
                <a href={data.socials.instagram.toString()}>
                  <IconBrandInstagram height="32" width="32" color="white" />
                </a>
                }
                { data.socials?.facebook && 
                <a href={data.socials.facebook.toString()}>
                  <IconBrandFacebook height="32" width="32" color="white" />
                </a>
                }
            </div>
          </div>
        </div>
        <div className={styles.profileInfo}>
          
          <div>
            <label>Background</label>
            <div>{data.background}</div>
          </div>
          <div>
            <label>Tags</label>
            <div>{data.tags}</div>
          </div>
        </div>
        

      </article>
    )
  }
  return (
    <article className={styles.profileCard}>
      <Spinner />
    </article>
  )

}

const Profile_Public: NextPage = () => {
  const router = useRouter();
  const [profileHandle, setProfileHandle] = useState("");

  useEffect(() => {
    const handle = router.query.handle;
    if (handle) {
      setProfileHandle(handle.toString())
    }
  }, [router.query.handle]);

  return (
    <main className={styles.app}>
      <PageMeta
        title="Profile Name"
        desc=""
        />
        <div className={styles.main}>
          {profileHandle && 
          <ProfileBody handle={profileHandle} />
          }
      </div>
  </main>
  )
}

export default Profile_Public
