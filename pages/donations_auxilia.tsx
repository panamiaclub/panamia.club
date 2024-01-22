import type { NextPage } from 'next'
import React, { ReactEventHandler } from 'react';

import styles from '@/styles/Donations.module.css'
import PageMeta from '@/components/PageMeta';

const Donations: NextPage = () => {
  return (
    <main className={styles.app}>
      <PageMeta
        title="Support Us Through Donations"
        desc="Help support us through donations which are used for events, campaigns and community support."
        />
        <div className={styles.main}>
          <section className={styles.header}>
            <h2>Donations</h2>
          </section>
          <section>
          <iframe id="auxilia-frame" src="https://app.theauxilia.com/embed/payments/client/pana_mia_club" className={styles.auxiliaFrame}></iframe>
          </section>
          <div className={styles.footer}></div>
      </div>
  </main>
  )
}

export default Donations
