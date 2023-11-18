import type { NextPage } from 'next'
import React, {  useState, FormEvent } from 'react';
import Link from 'next/link';

import styles from '../../styles/form/BecomeAPanaConfirmation.module.css'
import PageMeta from '../../components/PageMeta';
import PanaLogo from '../../components/PanaLogo';

const Form_BecomeAPanaConfirmation: NextPage = () => {

  return (
    <main className={styles.app}>
      <PageMeta
        title="Thank you for signing up!"
        desc=""
        />
      <div className={styles.main}>
        <PanaLogo color="white" bordered="pink" size="large" nolink={true} />
        <p></p>
        <h2>Thank you for signing up!</h2>
        <p className={styles.notice}>We're confirming your profile details and will email you when it's published.</p>
        <p>
            You can <Link href="/api/auth/signin"><a>Sign In</a></Link>
            &nbsp;using your profile email to see other features and continue updating your 
            profile! The Pana MIA Club community is here for you! Visit our <Link href="/about-us"><a>About Us</a></Link>
            to learn more about how we support locals.
        </p>
      </div>
  </main>
  )
}

export default Form_BecomeAPanaConfirmation
