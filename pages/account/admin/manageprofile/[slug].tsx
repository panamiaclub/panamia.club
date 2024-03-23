import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import { NextRouter, useRouter } from 'next/router';
import { IconUser } from '@tabler/icons';
import { forceInt, serialize } from '@/lib/standardized';
import PageMeta from '@/components/PageMeta';
import { UserInterface, Pagination, ProfileInterface } from '@/lib/interfaces';
import { standardizeDateTime } from '@/lib/standardized';
import { QueryClient, dehydrate, useQuery, useQueryClient } from '@tanstack/react-query';
import PanaButton from '@/components/PanaButton';
import AdminButton from '@/components/Admin/AdminButton';
import AdminMenu from '@/components/Admin/AdminHeader';
import { IconUserCircle, IconHeart, IconForms, IconSearch, IconStar, IconFilter,
  IconMap, IconCategory, IconMapPin, IconCurrentLocation, IconList, IconTrash,
  IconSortDescending, IconMapPins, IconExternalLink, IconBrandInstagram, IconBrandFacebook, IconMap2, IconBrandTiktok, IconBrandTwitter, IconBrandSpotify } from '@tabler/icons';
import { directorySearchKey, useSearch, SearchResultsInterface } from '@/lib/query/directory';
import { fetchPrivateProfile, profilePublicQueryKey, useMutateProfileSocialAdmin } from '@/lib/query/profile';
import Spinner from '@/components/Spinner';
import { AddressInterface, ProfileImagesInterface, ProfileSocialsInterface } from '@/lib/interfaces';
import Link from 'next/link';
import { Map, Marker, ZoomControl } from "pigeon-maps"
import styles from '@/styles/profile/Profile.module.css'
import { profileQueryKey, useProfile, useMutateProfileDescAdmin, fetchProfile  } from '@/lib/query/profile';
import { deleteFile, uploadFile } from "@/lib/bunnycdn/api";
import {fetchUser} from "@/lib/query/user";

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

const Manage_Pana_Profiles: NextPage = (props) => {
  const [editingDetails, setEditingDetails] = useState(Boolean);
  const [editingLinks, setEditingLinks] = useState(Boolean);
  const [editingAvatar, setEditingAvatar] = useState(Boolean);
  const [manageImages, setManageImages] = useState(Boolean);
  const [detailsError, setDetailsError] = useState("");
  const [linksError, setLinksError] = useState("");
  const [detailsMessage, setDetailsMessage] = useState("");
  const [linksMessage, setLinksMessage] = useState("");
  const [imagesError, setImagesError] = useState("");
  const [imagesMessage, setImagesMessage] = useState("");
  const [activateMessage, setActivateMessage] = useState("");
  const [activateError, setActivateError] = useState("");
  const [role, setRole] = useState();
  const { data: session } = useSession();

  const router = useRouter();
  const handle = router.query.slug as string;
  const { data, isLoading } = useQuery({
    queryKey: [ profilePublicQueryKey, { handle }],
    queryFn: () => fetchPrivateProfile(handle),
  });
  const {isError, refetch } = useProfile();
  //const { data: session } = useSession();
  const defaultCoords:[number, number] = [25.761681, -80.191788];
  const [coords, setCoords] = useState<[number, number]>(defaultCoords);
 
  const profileCoords = data?.geo ? [data.geo.coordinates[1], data.geo.coordinates[0]] as [number, number] : null;
  
  const mutation = useMutateProfileDescAdmin();
  const mutationSocials = useMutateProfileSocialAdmin();

  async function getUser() {
    try {
        const user = await fetchUser();
        return user;
    } catch (error) {
        console.error("Error fetching user:", error);
        throw error; // Re-throw the error to propagate it to the caller
    }
}
  
  useEffect( () => {
    const user = getUser()
    .then(user => {
        // Handle the user data
        setRole(user.status.role);
    })
    .catch(error => {
        // Handle errors
        console.error(error);
    });
  }, [])

  // useEffect(() => {
  //   console.log('user - admin role')
  //   console.log(role);
  // }, [role])

  console.log("user:handle", handle);

  console.log(data);

  function urlWithSource(url: string) {
    if (url.substring(0, 4) !== "http") {
      url = `https://${url}`;
    }
    try {
      const new_url = new URL(url);
      new_url.searchParams.set('utm_source', 'panamia');
      return new_url.toString();
    } catch (error) {

    }
    return url;
  }

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

  const clickMarker = () => {
    window.open(directionsFromAddress(data.primary_address));
  }

  function deactivate(email: any){
    axios
    .post(
      `/api/admin/profile/action`,
        {
          email:email,
          action: "decline"
        },
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        }
    ).then((resp) => {
      console.log(resp.data.msg);
      setActivateMessage(resp.data.msg  || "Profile de-activated!");
      refetch(); // refresh
    })
    .catch((error) => {
        console.log(error);
    });
  }

  function activate(email: any){
      axios
        .post(
            `/api/admin/profile/action`,
            {
              email:email,
              action: "approve"
            },
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        ).then((resp) => {
          console.log(resp.data.msg);
          setActivateMessage(resp.data.msg || "Profile activated!");
          refetch(); // refresh
        })
        .catch((error) => {
            console.log(error);
        });
  }

  const submitFormUserDetails = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    if(data.email){
      formData.forEach((value, key) => console.log(key, value));
      const updates = {
        name: formData.get("name"),
        five_words: formData.get("five_words"),
        details: formData.get("details"),
        background: formData.get("background"),
        tags: formData.get("tags"),
        email: data?.email
      }
      mutation.mutate(updates);
      setEditingDetails(false);
      setDetailsMessage("Succesfully edited profile!");
    }
  }

  const submitFormUserLinks = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    if(data.email){
      formData.forEach((value, key) => console.log(key, value));
      const updates = {
        socials: {
          website: formData.get("website"),
          facebook: formData.get("facebook"),
          instagram: formData.get("instagram"),
          tiktok: formData.get("tiktok"),
          twitter: formData.get("twitter"),
          spotify: formData.get("spotify"),
        },
        email: data?.email
      }
      mutationSocials.mutate(updates);
      setEditingLinks(false);
      setLinksMessage("Succesfully edited links!");
    }
  }

  const deleteImage = async (image:string) => {
    console.log('image delete pressed')
    console.log(role);
    if(!role || role != "admin"){
      setImagesError("No Admin Role!");
      return;
    }
    
    // console.log(data.images);
    console.log(image.split("/")[5]);
    const fileName = image.split("/")[5];
    var response = ""
    setImagesMessage("deleting image...");
    try{
      axios
      .post(
          `/api/admin/profile/deleteImage`,
          {
            filename:fileName,
          },
          {
              headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
              },
          }
      ).then((resp) => {
        console.log(resp.data.msg);
        setImagesMessage(resp.data.msg || "Image Deleted!");
        refetch(); // refresh
      })
      .catch((error) => {
          console.log(error);
      }); 
      
    }catch(error:any){
      setImagesError("error deleting image:" + error)
    }
    setImagesMessage(response.toString());
  }

  const submitForm = async (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    // formData.forEach((value, key) => console.log(key, value));
    const form = {
      primary: formData.get("images_primary") ? formData.get("images_primary") as File : null,
      email: data?.email,
    }
    console.log("form", form.primary);
    
    const uploads = await axios.post(
      "/api/admin/uploadAvatar",
      form,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "multipart/form-data",
          email: data?.email
      }
    })
    .catch((error) => {
      console.log(error);
      setDetailsError("Error replacing image!");
    });
    console.log("upload finished");
    setDetailsMessage("Succesfully replaced image!");
    setEditingAvatar(false);
    refetch(); // refresh images
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
      <div className={styles.manageProfile}>
       {activateMessage && <div className={styles.alertMessageDiv}>{activateMessage}</div>}
      
        <h3 style={{display:"inline"}}>Manage Profile: {data.name}</h3>
        
        {data.active && <button className={styles.deActivateButton} style={{float:"right"}} onClick={() => deactivate(data.email)}>Deactivate Profile</button> }
        {!data.active && <button className={styles.activateButton} style={{float:"right"}} onClick={() => activate(data.email)}>Activate Profile</button> }
        <button className={styles.editButton} style={{float:"right", marginRight:"5px"}} onClick={ () => {router.push('/account/admin/panaprofiles/')}}>Back</button> 

        <div className={styles.profileCard} style={{marginTop:"2%"}}>
            <div className={styles.profileHeader}>
              <div className={styles.profileImage}>
                {
                  data.images?.primaryCDN &&
                  <img src={data.images.primaryCDN} /> ||
                  <img src="/img/bg_coconut_blue.jpg" />
                }
                {!editingAvatar && <button className={styles.editButton} onClick={() => setEditingAvatar(true)}>Replace Avatar</button> }
                
                {data?.images?.primaryCDN && !editingAvatar && 
                <form onSubmit={(e) => deleteImage(data.images?.primaryCDN)}>
                  <button className={styles.deActivateButton} style={{marginLeft:"2%"}} type="submit">Delete Avatar</button>
                </form>
                }

                {editingAvatar && 
                    <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
                      <input type="file" id="images_primary" name="images_primary" accept="image/png, image/jpeg, image/webp" />
                      <div><small>Accepted images are jpg, png, and webp</small></div>

                      <button className={styles.cancelButton} onClick={() => {setEditingAvatar(false)}}>cancel</button>
                      <button className={styles.editButton} type="submit">Upload</button>
                  </form>
                }
              </div>
              {!editingDetails && 
              <div className={styles.profilePrimary}>
                  <h2 style={{display:"inline"}}>{data.name} </h2> <button className={styles.editButton} style={{float:"right"}} onClick={() => setEditingDetails(true)}>Edit Details</button> 
                  <p className={styles.profileFiveWords}>{data.five_words}</p>
                  <p>{data.details}</p>
                  <div className={styles.profileInfo}>
                    <label>Background</label>
                    <div>{data.background}</div>
                  </div>
              </div>
              }
              {editingDetails && 
                <div style={{width:"100%"}}>
                  <h3>Edit {data.name}</h3>
                  <form className={styles.accountForm} onSubmit={(e) => submitFormUserDetails(e, new FormData(e.currentTarget))}>
                    <div className={styles.accountFields}>
                      <label>name: </label>
                      <input type="text" id="name" name="name" defaultValue={data.name} style={{display:'block'}}/>
                    </div>

                    <div className={styles.accountFields}>
                      <label>details: </label>
                      <input type="text" id="details" name="details" defaultValue={data.details} style={{width:"100%"}}/>
                    </div>

                    <div className={styles.accountFields}>
                      <label>background: </label>
                      <input type="text" id="background" name="background" defaultValue={data.background} style={{width:"100%"}}/>
                    </div>

                    <div className={styles.accountFields}>
                      <label>five words: </label>
                      <input type="text" id="five_words" name="five_words" defaultValue={data.five_words} style={{width:"100%", marginBottom:"10px"}}/>
                    </div>

                    <div className={styles.accountFields}>
                      <label>tags: </label>
                      <input type="text" id="tags" name="tags" defaultValue={data.tags} style={{width:"100%", marginBottom:"10px"}}/>
                    </div>
                    
                    <button style={{float:"right"}} onClick={() => {setEditingDetails(false)}} className={styles.cancelButton}>cancel</button>
                    <button style={{float:"right"}} type="submit" className={styles.editButton}>save changes</button>
                  </form>
                </div>
              }
            </div>
            {detailsError && <div className={styles.alertMessageDiv}>{detailsError}</div>}
            {detailsMessage && <div className={styles.alertMessageDiv}>{detailsMessage}</div>}
            {!editingDetails && 
              <div className={styles.profileCard} style={{marginTop:"2%"}}>
                <div className={styles.profileInfo}>
                  <div>
                    <label>Tags: {data.tags}</label>
                  </div>
                </div>
              </div>
            }
           
          </div>
         

          { hasSocials(data.socials) && !editingLinks &&
          <div className={styles.profileCard}>
            <h3 style={{display:"inline"}}>Socials and Links</h3>
           <button className={styles.editButton} style={{float:"right"}} onClick={() => setEditingLinks(true)}>Edit Links</button> 
            <div className={styles.profileInfo}>
              { data.socials?.website && 
              <a href={urlWithSource(data.socials.website)} target="_blank" rel="noopener noreferrer">
                <IconExternalLink height="20" /> Website
              </a>
              }
              { data.socials?.instagram && 
              <a href={urlWithSource(data.socials.instagram)} target="_blank" rel="noopener noreferrer">
                <IconBrandInstagram height="20" /> Instagram
              </a>
              }
              { data.socials?.facebook && 
              <a href={urlWithSource(data.socials.facebook)} target="_blank" rel="noopener noreferrer">
                <IconBrandFacebook height="20" /> Facebook
              </a>
              }
              { data.socials?.tiktok && 
              <a href={urlWithSource(data.socials.tiktok)} target="_blank" rel="noopener noreferrer">
                <IconBrandTiktok height="20" /> TikTok
              </a>
              }
              { data.socials?.twitter && 
              <a href={urlWithSource(data.socials.twitter)} target="_blank" rel="noopener noreferrer">
                <IconBrandTwitter height="20" /> Twitter
              </a>
              }
              { data.socials?.spotify && 
              <a href={urlWithSource(data.socials.spotify)} target="_blank" rel="noopener noreferrer">
                <IconBrandSpotify height="20" /> Spotify
              </a>
              }
              {linksError && <div className={styles.alertMessageDiv}>{linksError}</div>}
              {linksMessage && <div className={styles.alertMessageDiv}>{linksMessage}</div>}
            </div>
          </div>
          }
        { hasSocials(data.socials) && editingLinks && 
            <div>
              <div className={styles.profileInfo}>
                <h3>Edit Socials</h3>
                <form className={styles.accountForm} onSubmit={(e) => submitFormUserLinks(e, new FormData(e.currentTarget))}>
              { data.socials?.website && 
                 <>
                 <label>Website: </label>
                  <input type="text" id="website" name="website" defaultValue={(data.socials.website.toString())} style={{display:'block', width:"100%"}}/>
                </>
              }
              { data.socials?.instagram && 
                <>
                  <label>Instagram: </label>
                  <input type="text" id="instagram" name="instagram" defaultValue={(data.socials.instagram.toString())} style={{display:'block', width:"100%"}}/>
                </>
              }
                { data.socials?.facebook && 
                <>
                 <label>Facebook: </label>
                 <input type="text" id="facebook" name="facebook" defaultValue={(data.socials.facebook.toString())} style={{display:'block', width:"100%"}}/>
                </>
              }
              { data.socials?.tiktok && 
                <>
                  <label>Tiktok: </label>
                  <input type="text" id="tiktok" name="tiktok" defaultValue={(data.socials.tiktok.toString())} style={{display:'block', width:"100%"}}/>
                </>
              }
              { data.socials?.twitter && 
               <>
                <label>Twitter: </label>
                <input type="text" id="twitter" name="twitter" defaultValue={(data.socials.twitter.toString())} style={{display:'block', width:"100%"}}/>
               </>
              }
              { data.socials?.spotify && 
              <>
                <label>Spotify: </label>
                <input type="text" id="spotify" name="spotify" defaultValue={(data.socials.spotify.toString())} style={{display:'block', width:"100%"}}/>
              </>
              }
              <button onClick={() => {setEditingLinks(false)}} className={styles.cancelButton} style={{marginTop:"10px"}}>cancel</button>
              <button className={styles.editButton} type="submit" >submit</button>
              </form>
            </div>
            </div>
          }
          {linksError && <div>{linksError}</div>}
         
          { hasGallery(data.images) &&
          <div className={styles.profileCard}>
           
            {!manageImages && 
            <>
              <h3 style={{display:"inline", marginRight:"5px"}}>Gallery</h3> 
              <small>Click to see full-size image</small>
              <button className={styles.editButton} style={{float:"right"}} onClick={() => setManageImages(true)}>Manage Images</button> 
            </>  
            }
            {manageImages && 
            <>
              <h3 style={{display:"inline", marginRight:"5px"}}>Manage Images</h3> 
              <button onClick={() => {setManageImages(false)}} className={styles.cancelButton} style={{marginTop:"10px"}}>cancel</button>
            </>
            }
            <div className={styles.profileInfo} style={{marginTop:"5%"}}>
              { data.images?.gallery1CDN &&
              <div className={styles.profileGalleryImage}>
                <img src={data.images?.gallery1CDN} onClick={(e) => {showGalleryDialog("dialog-gallery-1")}} /><br />
                <dialog id="dialog-gallery-1">
                  <small>Click to dismiss</small>
                  <a onClick={(e) => {closeGalleryDialog("dialog-gallery-1")}}>
                    <img src={data.images?.gallery1CDN} loading="lazy" />
                  </a>
                </dialog>
                {manageImages && 
                <form onSubmit={(e) => deleteImage(data.images?.gallery1CDN)}>
                  <button style={{textAlign:"center", border:"none", background:"none"}} type="submit"><IconTrash style={{color:"#FC2070"}}></IconTrash></button>
                </form>
                }
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
                {manageImages && 
                  <form className={styles.accountForm} onSubmit={(e) => deleteImage(data.images?.gallery2CDN)}>
                    <button style={{textAlign:"center", border:"none", background:"none"}} type="submit"><IconTrash style={{color:"#FC2070"}}></IconTrash></button>
                  </form>
                  }
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
                {manageImages && 
                 <form className={styles.accountForm} onSubmit={(e) => deleteImage(data.images?.gallery3CDN)}>
                  <button style={{textAlign:"center", border:"none", background:"none"}} type="submit"><IconTrash style={{color:"#FC2070"}}></IconTrash></button>
                  </form>
                  }
              </div>
              }
            </div>
            {imagesError && <div>{imagesError}</div>}
            {imagesMessage && <div>{imagesMessage}</div>}
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
                </div>
              </div>
            </div>
            { profileCoords && 
              <Map height={300} defaultCenter={profileCoords} defaultZoom={12}>
                <ZoomControl />
                <Marker width={40}
                  anchor={profileCoords}
                  color="#ff8100" 
                  onClick={clickMarker} />
              </Map>
            }
          </div>
          }
        </div>
    </main>
  )
}

export default Manage_Pana_Profiles;

