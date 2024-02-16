import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent} from 'react';
import { IconArrowBackUp, IconDeviceFloppy } from '@tabler/icons';
import { dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, useMutateProfileCategories  } from '@/lib/query/profile';
import Spinner from '@/components/Spinner';
import { serialize } from '@/lib/standardized';
import FullPage from '@/components/Page/FullPage';


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

const Account_Profile_Categories: NextPage = (props: any) => {
  console.log("Account_Profile_Categories");
  // console.log("session_user", props.session_user);
  const { data: session } = useSession();
  
  const mutation = useMutateProfileCategories();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const updates = {
      categories: {
        "products": formData.get("products") ? true : false,
        "services": formData.get("services") ? true : false,
        "events": formData.get("events") ? true : false,
        "music": formData.get("music") ? true : false,
        "food": formData.get("food") ? true : false,
        "clothing": formData.get("clothing") ? true : false,
        "accessories": formData.get("accessories") ? true : false,
        "art": formData.get("art") ? true : false,
        "digital_art": formData.get("digital_art") ? true : false,
        "tech": formData.get("tech") ? true : false,
        "health_beauty": formData.get("health_beauty") ? true : false,
        "spiritual": formData.get("spiritual") ? true : false,
        "non_profit": formData.get("non_profit") ? true : false,
        "homemade": formData.get("homemade") ? true : false,
      },
    }
    mutation.mutate(updates);
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
    <PageMeta title="Categories | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Categories</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <div className={styles.accountFormActions}>
          <PanaButton href="/account/profile/edit" compact={true}><IconArrowBackUp size={18} /> Back</PanaButton>
          <PanaButton color="blue" type="submit" disabled={isLoading} compact={true}><IconDeviceFloppy size={18} /> Save Changes</PanaButton>
        </div>
        <div className={styles.accountFields}>
          <p className={styles.accountNote}>Select the categories that best match your 
          profile, these will help users find your profile.</p>
        </div>
        <div className={styles.accountFields}>
          <label>Categories:</label>&emsp;
          <ul>
            <li>
                <label>
                <input type="checkbox" name="products" value="products" 
                defaultChecked={profile.categories?.products ? true : false} />
                &emsp;Products</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="services" value="services" 
                defaultChecked={profile.categories?.services ? true : false} />
                &emsp;Services</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="events" value="events" 
                defaultChecked={profile.categories?.events ? true : false} />
                &emsp;Events</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="music" value="music" 
                defaultChecked={profile.categories?.music ? true : false} />
                &emsp;Music</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="food" value="food" 
                defaultChecked={profile.categories?.food ? true : false} />
                &emsp;Food</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="clothing" value="clothing" 
                defaultChecked={profile.categories?.clothing ? true : false} />
                &emsp;Clothing</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="accessories" value="accessories" 
                defaultChecked={profile.categories?.accessories ? true : false} />
                &emsp;Accessories</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="art" value="art" 
                defaultChecked={profile.categories?.art ? true : false} />
                &emsp;Art</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="digital_art" value="digital_art" 
                defaultChecked={profile.categories?.digital_art ? true : false} />
                &emsp;Digital Art</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="tech" value="tech" 
                defaultChecked={profile.categories?.tech ? true : false} />
                &emsp;Tech</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="health_beauty" value="health_beauty" 
                defaultChecked={profile.categories?.health_beauty ? true : false} />
                &emsp;Health &amp; beauty</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="spiritual" value="spiritual" 
                defaultChecked={profile.categories?.spiritual ? true : false} />
                &emsp;Spiritual</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="non_profit" value="non_profit" 
                defaultChecked={profile.categories?.non_profit ? true : false} />
                &emsp;Non-Profit</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="homemade" value="homemade" 
                defaultChecked={profile.categories?.homemade ? true : false} />
                &emsp;Homemade</label>
            </li>
          </ul>
        </div>
        <div className={styles.accountFields}>
          <PanaButton color="blue" type="submit" disabled={isLoading}>Update</PanaButton>
        </div>
      </form>
      </div>
    </main>
  )

}

export default Account_Profile_Categories;

