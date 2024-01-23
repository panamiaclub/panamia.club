'use client';

import type { NextPage } from 'next'
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import styles from '../styles/Affiliate.module.css';
import { Local } from '@/lib/localstorage';



const Affiliate: NextPage = () => {
  const router = useRouter();

  const affiliate = router.query.code;
  // console.log("query", router.query);
  if (affiliate) {
    console.log("affiliate", affiliate);
    Local.set("affiliate", affiliate.toString(), 24 * 14); // consume the affiliate code
  }

  useEffect(() => {
    const redirectTo = router.query.to;
    if (redirectTo) {
      const redirect_key = redirectTo.toString().toUpperCase();
      if (redirect_key == "BECOMEAPANA") {
        console.log("Redirect:BECOMEAPANA");
        router.replace("/form/become-a-pana")
        // window.location.href="/form/become-a-pana";
      }
    }
    router.replace("/");
  })


  return (
    <div className={styles.affiliatePage}>
      Redirecting...
    </div>
  )
}

export default Affiliate
