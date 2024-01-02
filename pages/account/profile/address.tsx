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
  
  const mutation = useMutateProfileAddress();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);

  const clickSetCoordsFromAddress = async () => {
    console.log("clickSetCoordsFromAddress");
    const AddressFormData = new FormData(document.getElementById('form_address') as HTMLFormElement);
    const a = {
      "street1": AddressFormData.get("street1"),
      "street2": AddressFormData.get("street2"),
      "city": AddressFormData.get("city"),
      "state": AddressFormData.get("state"),
      "zipcode": AddressFormData.get("zipcode"),
    }
    if (!(a.street1 && a.city && a.state && a.zipcode)) {
      alert("Please fill out a Street, City, State and Zipcode");
      return false;
    }
    const address = `${a.street1}+${a.street2}+${a.city}+${a.state}+${a.zipcode}`
    const url = `https://geocode.maps.co/search?q=${address}&api_key=${process.env.NEXT_PUBLIC_GEOCODING_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      alert("We couldn't get your GeoLocation, check your address and try again")
      return false;
    }

    const geodata = await res.json();
    console.log(geodata);
  }

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const updates = {
      primary_address: {
        "street1": formData.get("street1"),
        "street2": formData.get("street2"),
        "city": formData.get("city"),
        "state": formData.get("state"),
        "zipcode": formData.get("zipcode"),
        "hours": formData.get("hours"),
        "lat": formData.get("lat"),
        "lng": formData.get("lng"),
      },
      counties: {
        "palm_beach": formData.get("county_palmbeach") ? true : false,
        "broward": formData.get("county_broward") ? true : false,
        "miami_dade": formData.get("county_miamidade") ? true : false,
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
    <PageMeta title="Address | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Address and Geolocation</h2>
      <form id="address_form" className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <p>
          <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
        </p>
        <div className={styles.accountFields}>
          <p className={styles.accountNote}>Your Primary Address is used for providing
          directions on your profile. If you're not doing business out of a set location,
          you don't need to provide this information.</p>
        </div>
        <div className={styles.accountFields}>
          <label>Street 1</label>&emsp;
          <input name="street1" type="text" defaultValue={profile.primary_address?.street1} />
        </div>
        <div className={styles.accountFields}>
          <label>Street 2</label>&emsp;
          <input name="street2" type="text" defaultValue={profile.primary_address?.street2} />
        </div>
        <div className={styles.accountFields}>
          <label>City</label>&emsp;
          <input name="city" type="text" defaultValue={profile.primary_address?.city} />
        </div>
        <div className={styles.accountFields}>
          <label>State</label>&emsp;
          <input name="state" type="text" defaultValue={profile.primary_address?.state} />
        </div>
        <div className={styles.accountFields}>
          <label>Zip Code</label>&emsp;
          <input name="zipcode" type="text" defaultValue={profile.primary_address?.zipcode} />
        </div>
        <div className={styles.accountFields}>
          <label>Hours</label>&emsp;
          <textarea name="hours" rows={4} maxLength={500} defaultValue={profile.primary_address?.hours}></textarea>
        </div>
        <br />
        <div className={styles.accountFields}>
          <p className={styles.accountNote}>Your GeoLocation is used for mapping and
          showing users their distance away from you. If you operate out of multiple areas,
          choose a central point among those areas. You can find this information through
          Google Maps, Apple Maps, or another mapping service.</p>
          <a onClick={clickSetCoordsFromAddress}>Get GeoLocation using my address</a>
        </div>
        <div className={styles.accountFields}>
          <label>Latitude</label>&emsp;
          <input id="geo_lat" name="lat" type="text" defaultValue={profile.primary_address?.lat} />
          <small>Example: 26.122582</small>
        </div>
        <div className={styles.accountFields}>
          <label>Longitude</label>&emsp;
          <input id="geo_lng" name="lng" type="text" defaultValue={profile.primary_address?.lng} />
          <small>Example: -80.137139</small>
        </div>
        <br />
        <div className={styles.accountFields}>
          <p className={styles.accountNote}>Counties can be selected if you operate or
          service inside of these areas. If you're not sure, it is okay to select all counties.</p>
        </div>
        <div className={styles.accountFields}>
          <label>Counties:</label>&emsp;
          <ul>
            <li>
                <label>
                <input type="checkbox" name="county_palmbeach" value="palm_beach" 
                defaultChecked={profile.counties?.palm_beach ? true : false} />
                &emsp;Palm Beach</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="county_broward" value="broward" 
                defaultChecked={profile.counties?.broward ? true : false} />
                &emsp;Broward</label>
            </li>
            <li>
                <label>
                <input type="checkbox" name="county_miamidade" value="miami_dade" 
                defaultChecked={profile.counties?.miami_dade ? true : false} />
                &emsp;Miami-Dade</label>
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

export default Account_Profile_Address;

