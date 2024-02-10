import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { useSession } from 'next-auth/react';
import { FormEvent} from 'react';
import Link from 'next/link';
import { useQueryClient, dehydrate, QueryClient } from '@tanstack/react-query';

import { authOptions } from "../../api/auth/[...nextauth]";
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { ProfileInterface  } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import PanaButton from '@/components/PanaButton';
import { profileQueryKey, useProfile, useMutateProfileGenteDePana  } from '@/lib/query/profile';
import Spinner from '@/components/Spinner';
import { serialize } from '@/lib/standardized';
import FullPage from '@/components/Page/FullPage';


export const getServerSideProps: GetServerSideProps = async function (context) {
  const queryClient = new QueryClient();
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

const Account_Profile_GenteDePana: NextPage = (props: any) => {
  console.log("Account_Profile_GenteDePana");
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const mutation = useMutateProfileGenteDePana();
  const { data, isLoading, isError } = useProfile();
  const profile = (data as ProfileInterface);

  const submitForm = (e: FormEvent, formData: FormData) => {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const updates = {
      discount_code: formData.get("code"),
      discount_percentage: formData.get("percentage"),
      discount_details: formData.get("details"),
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
    <PageMeta title="Contact Info | Edit Profile" desc="" />
    <div className={styles.main}>
      <h2 className={styles.accountTitle}>Profile - Edit Gente dePana Offers</h2>
      <form className={styles.accountForm} onSubmit={(e) => submitForm(e, new FormData(e.currentTarget))}>
        <p>
          <Link href="/account/profile/edit"><a>Back to Profile</a></Link>
        </p>
        <div className={styles.accountFields}>
          <label>Discount Code</label>&emsp;
          <input name="code" type="text" defaultValue={profile?.gentedepana?.code} />
        </div>
        <div className={styles.accountFields}>
          <label>Discount Percentage</label>&emsp;
          <input name="percentage" type="text" defaultValue={profile?.gentedepana?.percentage} />
        </div>
        <div className={styles.accountFields}>
          <label>Discount Details</label>&emsp;
          <textarea name="details" rows={4} maxLength={500} defaultValue={profile?.gentedepana?.details}></textarea>
          <small>For adding specific details or exemptions that apply to the discount provided.</small>
        </div>
        <div className={styles.accountFields}>
          <PanaButton color="blue" type="submit" disabled={isLoading}>Update</PanaButton>
        </div>
      </form>
      <div>
        <h3>Help &amp; FAQs</h3>
        <dl className={styles.accountFAQs}>
          <dt>What are Gente dePana Discounts? </dt>
          <dd>
            <p>Gente dePana is Pana MIA Club's subscription membership. Discount codes are one of the 
            perks of our subscription membership and can be used by our Gente dePana. Users will have 
            the capability to filter by Pana Members offering discounts.</p>

            <p>Pana MIA Club is a nonprofit, which means we depend on external funding to manage all 
            our operations. Instead of relying on special interest sponsors, we want to remain a 
            grassroots organization. This means many small donors. You can check out the 
            &nbsp;<Link href="/donate/"><a>membership tiers</a></Link>.</p>
          </dd>

          <dt>How does the discount work? </dt>
          <dd>
            <p>As the business/service provider, you controls the details of the discount. You can 
            decide the value of the discount, how often it can be used, etc. You will then build in 
            the discount in your shopcart software and add the details on your Pana MIA 
            profile account.</p>
          </dd>

          <dt>Is there a benefit for me to offer a Gente dePana Discount?</dt>
          <dd>
            <p>At the end of the year please run a report for the total debit amount offered for 
              the specific Gente dePana discount. Pana MIA Club will issue your business a Donation 
              Receipt for the total amount which you can use as a donation on your taxes. </p>
          </dd>
        </dl>
      </div>
      </div>
    </main>
  )

}

export default Account_Profile_GenteDePana;

