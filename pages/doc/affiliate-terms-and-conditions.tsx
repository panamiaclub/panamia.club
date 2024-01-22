import type { NextPage } from 'next'

import styles from '../../styles/Doc.module.css'
import PageMeta from '../../components/PageMeta';
import { useRouter } from 'next/router';
import Link from 'next/link';

const Doc_AffiliateTermsAndConditions: NextPage = () => {
  return (
    <main className={styles.app}>
      <PageMeta
        title="ComPana Terms and Conditions"
        desc="ComPana Affiliate Agreement Terms for Pana MIA Club"
        />
        <div className={styles.main}>
          <section className={styles.docHeader}>
            <h2>Terms and Conditions</h2>
            <h3>ComPana Agreement Terms for Pana MIA Club</h3>
          </section>
          <section className={styles.docBody}>

          <strong>1. Introduction</strong>
          <p>By entering into this affiliate agreement with Pana MIA Club, you agree to the
             following terms and conditions. This agreement outlines the rights and 
             responsibilities of both parties concerning the affiliate relationship.</p>

          <strong>2. Affiliate Responsibilities</strong>
          <p>&emsp;2.a. <em>Promotion:</em> The affiliate agrees to actively promote Pana MIA Club in 
            a positive manner and in accordance with the organization's values and mission.
             This includes but is not limited to social media content, videography, blogs, 
             newsletters, and any other publications with any mention of our brand and/or 
             team members.</p>
          <p>&emsp;2.b. <em>Compliance:</em> Affiliates must comply with all applicable laws and 
          regulations in their promotion of Pana MIA Club. Any unethical or inappropriate 
          promotional activities may result in termination of the affiliate relationship 
          with or without notice.</p>

          <strong>3. Rewards</strong>
          <p>The affiliate will receive Pana Points for each qualifying action generated 
            through their exclusive affiliate link or code. These points can be redeemed 
            within the affiliate system, providing individuals with the opportunity to 
            accumulate points eligible for specific rewards (subject to change).</p>

          <strong>4. Tracking and Reporting</strong>
          <p>&emsp;4.a. <em>Tracking:</em>  Pana MIA Club will provide the affiliate with unique 
            tracking links or codes to ensure accurate point attribution.</p>
          <p>&emsp;4.b. <em>Reporting:</em> The affiliate will have access to information upon 
            request for tracking conversions, points, and other relevant metrics.</p>

          <strong>5. Termination</strong>
          <p>Either party may terminate this agreement at any time with a written notice.</p>

          <strong>6. Confidentiality</strong>
          <p>The affiliate agrees to keep any non-public information received during the 
            course of this agreement confidential and not to disclose it to third parties. 
            Any materials not explicitly given permission to share should not be disseminated.</p>

          <strong>7. Amendments</strong>
          <p>Pana MIA Club reserves the right to modify the terms of this agreement at 
            any time. Affiliates will be notified of any changes, and continued participation 
            implies acceptance of the modified terms.</p>

          <strong>8. Communications</strong>
          <p>The affiliate consents to receiving all marketing and promotional materials 
            via email and direct messaging.</p>
          <p>By becoming an affiliate, you acknowledge that you have read, understood, and agreed
             to these terms and conditions.</p>

          </section>
          <div className={styles.docFooter}></div>
      </div>
  </main>
  )
}

export default Doc_AffiliateTermsAndConditions;
