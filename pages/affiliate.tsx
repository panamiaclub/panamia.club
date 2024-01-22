'use client';

import type { NextPage } from 'next'
import { useRouter } from 'next/router';

import { Local } from '@/lib/localstorage';
import { useEffect } from 'react';


const Affiliate: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    const affiliate = router.query.code;
    console.log("query", router.query);
    if (affiliate) {
      console.log("affiliate", affiliate);
      // consume the affiliate code
      Local.set("affiliate", affiliate.toString(), 24 * 14);
    }
    const redirectTo = router.query.to;
    if (redirectTo) {
      const redirect_key = redirectTo.toString().toUpperCase();
      if (redirect_key == "BECOMEAPANA") {
        router.replace("/form/become-a-pana")
      }
    }
    // router.replace("/"); // no redirectTo, go to home page
  }, [])

  return (
    <div>
      Redirecting...
    </div>
  )
}

export default Affiliate
