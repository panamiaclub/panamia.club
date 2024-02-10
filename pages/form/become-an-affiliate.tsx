import type { NextPage } from 'next'
import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';

import styles from '@/styles/form/StandardForm.module.css'
import PageMeta from '@/components/PageMeta';
import PanaLogoLong from '@/components/PanaLogoLong';
import Required from '@/components/Form/Required';
import PanaButton from '@/components/PanaButton';

const Form_BecomeAnAffiliate: NextPage = () => {
  // TODO: User must be logged in to access page
  const [acceptTOS, setAcceptTOS] = useState(false);

  const acceptAffiliateTOS = async() => {
    const response = await axios
        .post(
            "/api/affiliate/acceptTOS",
            {
                accept_tos: acceptTOS,
            },
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        )
        .catch((error) => {
            console.log(error);
            alert("There was a problem submitting the form. Please refresh the page and try again.");
        });
    return response
  }

  function validateAffiliateTOS() {
    return true;
  }

  async function submitAffiliateTOS(e: FormEvent) {
    e.preventDefault();
    if (validateAffiliateTOS()) {
        const response = await acceptAffiliateTOS();
        if (response) {
            if(response.data.error) {
                alert(response.data.error);
            } else {
              alert('Your affiliate code has been activated!');
              location.href="/";
            }
        }
    }
  }

  // TODO: User must be signed in

  return (
    <main className={styles.app}>
      <PageMeta
        title="Become An Affiliate"
        desc="Join Our Affiliate Program to earn rewards"
        />
      <div className={styles.main}>
        <div className={styles.formLogo}>
            <PanaLogoLong  color="blue" size="large" nolink={true} />
        </div>
        <h2 className={styles.formTitle}>Become A ComPana</h2>
        <p>Complete the form below to join our ComPana Affiliate Program and start earning awesome rewards!</p>
        <section id="form-section" className={styles.outerGradientBox}>
            <form id="form-form" className={styles.innerGradientBox} onSubmit={submitAffiliateTOS}>
                <br/>
                <p className={styles.formFields}>
                  Please review the Full <Link href="/doc/affiliate-terms-and-conditions"><a>Terms and Conditions</a></Link>
                </p>
                <div className={styles.formFields}>
                  <p><strong>Terms and Conditions Summary</strong></p>
                  <ol>
                    <li>The affiliate agrees to actively promote Pana MIA Club in a positive 
                      manner and in accordance with the organization's values and mission.</li>
                    <li>Affiliates must comply with all applicable laws and regulations in 
                      their promotion of Pana MIA Club</li>
                    <li>Points can be redeemed within the affiliate system, providing individuals 
                      with the opportunity to accumulate points eligible for specific rewards 
                      (subject to change).</li>
                    <li>The affiliate consents to receiving all marketing and promotional 
                      materials via email and direct messaging</li>
                  </ol>
                </div>
                <p className={styles.formFields}>
                    <Required /><br />
                    <label> <input type="checkbox" value="yes" checked={acceptTOS}
                        onChange={(e:any) => setAcceptTOS(e.target.checked)} />
                        &nbsp;I have read and agree to the Affiliate Terms and Conditions
                    </label>
                </p>
                <p className={styles.formSubmitFields}>
                    <PanaButton text="&emsp;Submit Form&emsp;" color="pink" type="submit"/>
                </p>
            </form>
          </section>
        </div>
    </main>
  )
}

export default Form_BecomeAnAffiliate;
