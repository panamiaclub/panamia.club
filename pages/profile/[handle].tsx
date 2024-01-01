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
import { GeoJson, Map, Marker } from "pigeon-maps"
import { useState, useEffect } from 'react';

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
  const [coords, setCoords] = useState<[number, number]>();
  const defaultCoords:[number, number] = [25.761681, -80.191788];

  const { data, isLoading } = useQuery({
    queryKey: [ profilePublicQueryKey, { handle }],
    queryFn: () => fetchPublicProfile(handle),
  });

  function hasAddress(address: AddressInterface) {
    if (address?.street1 || address?.street2 || address?.city ||
      address?.state || address?.zipcode) {
      return true;
    }
    return false;
  }
  function hasSocials(socials: ProfileSocialsInterface) {
    if (socials?.website || socials?.facebook || socials?.instagram ||
      socials?.tiktok || socials?.twitter || socials?.spotify) {
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

  function showGalleryDialog(id: string) {
    const dialog = document.getElementById(id) as HTMLDialogElement;
    dialog.showModal();
  }

  function closeGalleryDialog(id: string) {
    const dialog = document.getElementById(id) as HTMLDialogElement;
    dialog.close();
  }


  const plus = (s: string) => {
    return s.trim().replaceAll(" ","+");
  }

  const directionsFromAddress = (a: AddressInterface) => {
    const baseUrl = "https://www.google.com/maps/search/"
    const address = `${a.street1}+${a.street2}+${a.city}+${a.state}+${a.zipcode}`
    return `${baseUrl}${plus(address)}`
  }

  const getHumanReadableAddress = (a: AddressInterface) => {
    console.log('address:');
    console.log(a);
    const address = `${a.street1}+${a.street2}+${a.city}+${a.state}+${a.zipcode}`
    return address;
  }

  const getCoords = async(address: string) => {
    if(!data.geo.coordinates){
      //  const url = "https://geocode.maps.co/search?q=" + address + "&api_key=" + process.env.NEXT_PUBLIC_GEOCODING_API_KEY;
      //  const res = await fetch(url);

      // if (!res.ok) {
      //   console.error("something went wrong, check your console.");
      //   return;
      // }

      // const response = await res.json();
      // console.log(response);
    }else{
      console.log(data.geo.coordinates[1], data.geo.coordinates[0]);
      console.log('geo coords')
  
      return ([data.geo.coordinates[1], data.geo.coordinates[0]]);
    }
  }

  useEffect( () => {
    if(data && data.primary_address){
      const addr = getHumanReadableAddress(data.primary_address);
      getCoords(addr);
    }
  }, [coords])


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
              <div className={styles.profileInfo} style={{width:"30%"}}>
                <div>
                    <label>Hours</label>
                    <div>{data.primary_address?.hours}</div>
                  </div>
              </div>
              <div className={styles.profileInfo}  style={{width:"70%"}}>
                <div>
                  <div style={{display:"flex"}}>
                    <div style={{width:"50%"}}>
                      <label style={{display:"block"}}>Address</label>
                      <span>{data.primary_address?.street1} {data.primary_address?.street2}</span>
                      <div>{data.primary_address?.city} {data.primary_address?.state} {data.primary_address?.zipcode}</div>
                    </div>

                    <div style={{width:"50%"}}>
                      <Link href={directionsFromAddress(data.primary_address)}><a><IconMap2 height="20" /> Get Directions</a></Link>
                    </div>
                  </div>
                  <Map height={300} defaultCenter={coords} defaultZoom={11}>
                    <Marker width={50} anchor={coords} />
                  </Map>
                </div>
              </div>
            </div>
          </div>
          }
          { hasGallery(data.images) &&
          <div className={styles.profileCard}>
            <h3>Gallery</h3>
            <small>Click to see full-size image</small>
            <div className={styles.profileInfo}>
              { data.images?.gallery1CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery1CDN} onClick={(e) => {showGalleryDialog("dialog-gallery-1")}} /><br />
                <dialog id="dialog-gallery-1">
                  <small>Click to dismiss</small>
                  <a onClick={(e) => {closeGalleryDialog("dialog-gallery-1")}}>
                    <img src={data.images?.gallery1CDN} loading="lazy" />
                  </a>
                </dialog>
              </div>
              }
              { data.images?.gallery2CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery2CDN} onClick={(e) => {showGalleryDialog("dialog-gallery-2")}} /><br />
                <dialog id="dialog-gallery-2">
                  <small>Click to dismiss</small>
                  <a onClick={(e) => {closeGalleryDialog("dialog-gallery-2")}}>
                    <img src={data.images?.gallery2CDN} loading="lazy" />
                  </a>
                </dialog>
              </div>
              }
              { data.images?.gallery3CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery3CDN} onClick={(e) => {showGalleryDialog("dialog-gallery-3")}} /><br />
                <dialog id="dialog-gallery-3">
                  <small>Click to dismiss</small>
                  <a onClick={(e) => {closeGalleryDialog("dialog-gallery-3")}}>
                    <img src={data.images?.gallery3CDN} loading="lazy" />
                  </a>
                </dialog>
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
