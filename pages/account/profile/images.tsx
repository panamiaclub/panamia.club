import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent} from 'react';
import Link from 'next/link';
import { dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, useMutateProfileAddress  } from '@/lib/query/profile';
import Spinner from '@/components/Spinner';
import { serialize } from '@/lib/standardized';
import FullPage from '@/components/Page/FullPage';
import axios from 'axios';
import { IconArrowBackUp, IconDeviceFloppy } from '@tabler/icons';


export const getServerSideProps: GetServerSideProps = async function (context) {
  const queryClient = new QueryClient()
  const session = await getServerSession( context.req, context.res, authOptions );
  const userLib = await import("@/lib/server/user");
  const session_user = (session) ? serialize(await userLib.getUser(session.user.email)) : null;
  const profileLib = await import("@/lib/server/profile");
  await queryClient.prefetchQuery({
      queryKey: profileQueryKey,
      initialData: serialize(await profileLib.getProfile(session.user.email)),
  });
  return {
    props: {
      session: session,
      session_user: session_user,
      dehydratedState: dehydrate(queryClient),
    },
  }
}

const Account_Profile_Address: NextPage = (props: any) => {
  console.log("Account_Profile_Address");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();
  
  const { data, isLoading, isError, refetch } = useProfile();
  const profile = (data as ProfileInterface);

  const submitForm = async (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    // formData.forEach((value, key) => console.log(key, value));
    const form = {
      primary: formData.get("images_primary") ? formData.get("images_primary") as File : null,
      gallery1: formData.get("images_gallery1") ? formData.get("images_gallery1") as File : null,
      gallery2: formData.get("images_gallery2") ? formData.get("images_gallery2") as File : null,
      gallery3: formData.get("images_gallery3") ? formData.get("images_gallery3") as File : null,
    }
    console.log("form", form.primary);
    const uploads = await axios.post(
      "/api/profile/upload",
      form,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "multipart/form-data"
      }
    })
    .catch((error) => {
      console.log(error);
    });
    console.log("upload finished");
    refetch(); // refresh images
  }

  console.log("status", isLoading, data);

  if (!session) {
    return ( <Status401_Unauthorized /> )
  }

  if (!profile) {
    return ( <FullPage><Spinner /></FullPage> );
  }

  return (
    <main className={styles.app}>
    <PageMeta title="Images | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Images</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <div className={styles.accountFormActions}>
          <PanaButton href="/account/profile/edit" compact={true}><IconArrowBackUp size={18} /> Back</PanaButton>
          <PanaButton color="blue" type="submit" disabled={isLoading} compact={true}><IconDeviceFloppy size={18} /> Save Changes</PanaButton>
        </div>
        <fieldset className={styles.profileFieldset}>
          <legend>Primary Picture</legend>
          <div className={styles.accountFields}>
            <p className={styles.accountNote}>Your primary picture is displayed on the directory
            search and will usually be your logo, your storefront, or yourself.</p>
            <input type="file" id="images_primary" name="images_primary" accept="image/png, image/jpeg, image/webp" />
            <div><small>Accepted images are jpg, png, and webp</small></div>
            { data?.images?.primaryCDN &&
            <div className={styles.accountImageBox}>
              <img src={data.images.primaryCDN} height="200" width="auto" />
            </div>
            }
          </div>
        </fieldset>
        <fieldset className={styles.profileFieldset}>
          <legend>Gallery - Position 1</legend>
          <div className={styles.accountFields}>
            <input type="file" id="images_gallery1" name="images_gallery1" accept="image/png, image/jpeg, image/webp" />
            <div><small>Accepted images are jpg, png, and webp</small></div>
            { data?.images?.gallery1CDN &&
            <div className={styles.accountImageBox}>
              <img src={data.images.gallery1CDN} height="200" width="auto" />
            </div>
            }
          </div>
        </fieldset>
        <fieldset className={styles.profileFieldset}>
          <legend>Gallery - Position 2</legend>
          <div className={styles.accountFields}>
            <input type="file" id="images_gallery2" name="images_gallery2" accept="image/png, image/jpeg, image/webp" />
            <div><small>Accepted images are jpg, png, and webp</small></div>
            { data?.images?.gallery2CDN &&
            <div className={styles.accountImageBox}>
              <img src={data.images.gallery2CDN} height="200" width="auto" />
            </div>
            }
          </div>
        </fieldset>
        <fieldset className={styles.profileFieldset}>
          <legend>Gallery - Position 3</legend>
          <div className={styles.accountFields}>
            <input type="file" id="images_gallery3" name="images_gallery3" accept="image/png, image/jpeg, image/webp" />
            <div><small>Accepted images are jpg, png, and webp</small></div>
            { data?.images?.gallery3CDN &&
            <div className={styles.accountImageBox}>
              <img src={data.images.gallery3CDN} height="200" width="auto" />
            </div>
            }
          </div>
        </fieldset>
      </form>
      </div>
    </main>
  )

}

export default Account_Profile_Address;

