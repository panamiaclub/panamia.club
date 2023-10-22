import type { NextPage } from 'next'
import React from 'react';

import styles from '../styles/BecomeAPana.module.css'
import PageMeta from '../components/PageMeta';

const BecomeAPana: NextPage = () => {
  return (
    <main className={styles.app}>
      <PageMeta
        title="Become a Pana"
        desc="Sign up to become a Pana and get the benefits of being listed on our directory!"
        image="https://www.panamia.club/logos/panamia_pink.svg"
        />
      <div className={styles.main}>
        <iframe className={styles.fullFrame} src="https://docs.google.com/forms/d/e/1FAIpQLSdE7qckjuydnNl4GPLyyU6whh89MuOGTIEZIaI5EhFfOk4wVA/viewform?embedded=true">Loading...</iframe>
      </div>
  </main>
  )
}

export default BecomeAPana
