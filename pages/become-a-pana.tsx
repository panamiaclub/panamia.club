'use client';

import type { NextPage } from 'next'
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import styles from '../styles/Affiliate.module.css';

const Affiliate: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/form/become-a-pana");
  })
  

  return (
    <>
    </>
  )
}

export default Affiliate
