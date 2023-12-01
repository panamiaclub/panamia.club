import type { GetServerSideProps, NextPage } from 'next'
import { useRouter } from 'next/router';
import { QueryClient, dehydrate, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconExternalLink, IconBrandInstagram, IconBrandFacebook, IconMap2, IconBrandTiktok, IconBrandTwitter, IconBrandSpotify } from '@tabler/icons';

import styles from '@/styles/profile/Profile.module.css'
import PageMeta from '@/components/PageMeta';
import Spinner from '@/components/Spinner';
import { fetchPublicProfile, profilePublicQueryKey } from '@/lib/query/profile';
import { serialize } from '@/lib/standardized';
import { AddressInterface, ProfileImagesInterface, ProfileSocialsInterface } from '@/lib/interfaces';
import Link from 'next/link';

export const getServerSideProps: GetServerSideProps = async function (context) {
  const handle = context.query.handle as string;
  const queryClient = new QueryClient();
  const profileLib = await import("@/lib/server/profile");
  if (handle) {
    await queryClient.prefetchQuery({
      queryKey: [ profilePublicQueryKey, { handle }],
      initialData: serialize(await profileLib.getPublicProfile(handle)),
    });
  }
  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  }
}

const Profile_Public: NextPage = () => {
  const router = useRouter();
  const handle = router.query.handle as string;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [ profilePublicQueryKey, { handle }],
    queryFn: () => fetchPublicProfile(handle),
  });

  function hasAddress(address: AddressInterface) {
    if (address.street1 || address.street2 || address.city ||
      address.state || address.zipcode) {
      return true;
    }
    return false;
  }
  function hasSocials(socials: ProfileSocialsInterface) {
    if (socials.website || socials.facebook || socials.instagram ||
      socials.tiktok || socials.twitter || socials.spotify) {
      return true;
    }
    return false;
  }

  function hasGallery(images: ProfileImagesInterface) {
    if (images?.gallery1CDN || images?.gallery2CDN || images?.gallery3CDN) {
      return true;
    }
    return false;
  }


  const plus = (s: string) => {
    return s.trim().replaceAll(" ","+");
  }

  const directionsFromAddress = (a: AddressInterface) => {
    const baseUrl = "https://www.google.com/maps/search/"
    const address = `${a.street1}+${a.street2}+${a.city}+${a.state}+${a.zipcode}`
    return `${baseUrl}${plus(address)}`
  }

  if (!data) {
    return (
      <article className={styles.profileCard}>
        <Spinner />
      </article>
    )
  }
  
  return (
    <main className={styles.app}>
      <PageMeta
        title={data.name}
        desc={data.details}
        />
      <div className={styles.main}>
        <div className={styles.profileCard}>
            <div className={styles.profileHeader}>
              <div className={styles.profileImage}>
                {
                  data.images?.primaryCDN &&
                  <img src={data.images.primaryCDN} /> ||
                  <img src="/img/bg_coconut_blue.jpg" />
                }
              </div>
              <div className={styles.profilePrimary}>
                <h2>{data.name} </h2>
                <p className={styles.profileFiveWords}>{data.five_words}</p>
                <p>{data.details}</p>
                <div className={styles.profileInfo}>
                  <label>Background</label>
                  <div>{data.background}</div>
                </div>
              </div>
            </div>
          </div>

          { hasSocials(data.socials) &&
          <div className={styles.profileCard}>
            <h3>Socials and Links</h3>
            <div className={styles.profileInfo}>
              { data.socials?.website && 
              <a href={data.socials.website}>
                <IconExternalLink height="20" /> Website
              </a>
              }
              { data.socials?.instagram && 
              <a href={data.socials.instagram}>
                <IconBrandInstagram height="20" /> Instagram
              </a>
              }
              { data.socials?.facebook && 
              <a href={data.socials.facebook}>
                <IconBrandFacebook height="20" /> Facebook
              </a>
              }
              { data.socials?.tiktok && 
              <a href={data.socials.tiktok}>
                <IconBrandTiktok height="20" /> TikTok
              </a>
              }
              { data.socials?.twitter && 
              <a href={data.socials.twitter}>
                <IconBrandTwitter height="20" /> Twitter
              </a>
              }
              { data.socials?.spotify && 
              <a href={data.socials.spotify}>
                <IconBrandSpotify height="20" /> Spotify
              </a>
              }
            </div>
          </div>
          }

          { hasAddress(data.primary_address) &&
          <div className={styles.profileCard}>
            <h3>Location</h3>
            <div className={styles.profileInfoSplit}>
              <div className={styles.profileInfo}>
                <div>
                  <label>Address</label>
                  <div>{data.primary_address.street1} {data.primary_address.street2}</div>
                  <div>{data.primary_address.city} {data.primary_address.state} {data.primary_address.zipcode}</div>
                  <Link href={directionsFromAddress(data.primary_address)}><a><IconMap2 height="20" /> Get Directions</a></Link>
                </div>
              </div>
              <div className={styles.profileInfo}>
                <div>
                  <label>Hours</label>
                  <div>{data.primary_address?.hours}</div>
                </div>
              </div>
            </div>
          </div>
          }
          { hasGallery(data.images) &&
          <div className={styles.profileCard}>
            <h3>Gallery</h3>
            <div className={styles.profileInfo}>
              { data.images?.gallery1CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery1CDN} /> <br />
              </div>
              }
              { data.images?.gallery2CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery2CDN} /> <br />
              </div>
              }
              { data.images?.gallery3CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery3CDN} /> <br />
              </div>
              }
            </div>
          </div>
          }
          
          <div className={styles.profileCard}>
            <div className={styles.profileInfo}>
              <div>
                <label>Tags: {data.tags}</label>
              </div>
            </div>
          </div>
        </div>
    </main>
  )
}

export default Profile_Public
