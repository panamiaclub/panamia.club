import type { NextPage } from 'next'
import React from 'react';

import styles from '../../styles/GoogleEmbeddedForm.module.css'
import PageMeta from '../../components/PageMeta';

const CosaHechaLoveLocalMarketVendorForm: NextPage = () => {
  return (
    <main className={styles.app}>
      <PageMeta
        title="Cosa Hecha + Love Local Market Vendor Form"
        desc="A sustainability centric market hosted at the Hub on December 17th. "
        />
      <div className={styles.main}>
      
      <iframe className={styles.fullFrame} src="https://docs.google.com/forms/d/e/1FAIpQLSe3Zku8K6Pv8461zFVEvTSmvfjtFDM752ssmYWmjTzpW2bqLQ/viewform?embedded=true">Loading...</iframe>
      </div>
  </main>
  )
}

export default CosaHechaLoveLocalMarketVendorForm
