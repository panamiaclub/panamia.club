import type { NextPage } from 'next'

import styles from '../../styles/Donations2.module.css'
import PageMeta from '../../components/PageMeta';
import { useRouter } from 'next/router';
import Link from 'next/link';

const Podcasts: NextPage = () => {
  const router = useRouter();
  const tier = router.query?.tier ? parseInt(router.query.tier.toString()) : 0;

  return (
    <main className={styles.app}>
      <PageMeta
        title="Donation Confirmation"
        desc=""
        />
        <div className={styles.main}>
          <section className={styles.confirmationHeader}>
            <h2>Muchisimas Gracias!</h2>
            { (tier > 0) &&
              <h3>Thank you so much for becoming a Gente dePana!</h3> ||
              <h3>Thank you so much for your contribution!</h3>
            }
          </section>
          <section className={styles.confirmationBody}>
            { (tier > 0) &&
              <div className={styles.confirmationDePana}>
                <div className={styles.confirmationDePanaInner}>
                  <p>You will be receiving a confirmation email from us soon with your 
                  monthly donation amount and the perks associated with your subscription. 
                  These features should be activated in your account shortly.</p>
                </div>
              </div>
            }
          <p><strong>Your support makes all the difference in our ability to reach and 
            support the local South Florida community. Your generosity helps us 
            achieve our vision!</strong></p>
          <p>If you have any questions or comments, please feel free to contact 
            us at <Link href="mailto:gentede@panamia.club"><a>gentede@panamia.club</a></Link></p>
          </section>
          <div className={styles.footer}></div>
      </div>
  </main>
  )
}

export default Podcasts
