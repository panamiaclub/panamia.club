import type { NextPage } from 'next'

import styles from '../../styles/Doc.module.css'
import PageMeta from '../../components/PageMeta';

const Doc_TermsAndConditions: NextPage = () => {
  return (
    <main className={styles.app}>
      <PageMeta
        title="Terms and Conditions"
        desc="Terms and Conditions for Pana MIA Club"
        />
        <div className={styles.main}>
          <section className={styles.docHeader}>
            <h2>Terms and Conditions</h2>
          </section>
          <section className={styles.docBody}>
          </section>
          <div className={styles.docFooter}></div>
      </div>
  </main>
  )
}

export default Doc_TermsAndConditions;
