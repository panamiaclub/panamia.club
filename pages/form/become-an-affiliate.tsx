import type { NextPage } from 'next'
import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';

import styles from '@/styles/form/StandardForm.module.css'
import PageMeta from '@/components/PageMeta';
import PanaLogoLong from '@/components/PanaLogoLong';
import Required from '@/components/Form/Required';
import PanaButton from '@/components/PanaButton';

const Form_ContactUs: NextPage = () => {
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
            return null;
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
        <h2 className={styles.formTitle}>Become An Affiliate</h2>
        <p>Complete the form below to join our Affiliate Program and start earning awesome rewards!</p>
        <section id="form-section" className={styles.outerGradientBox}>
            <form id="form-form" className={styles.innerGradientBox} onSubmit={submitAffiliateTOS}>
                <br/>
                <p className={styles.formFields}>
                  Please review the Full <Link href="#"><a>Terms of Service</a></Link>
                </p>
                <div className={styles.formFields}>
                  <p><strong>Terms of Service Summary</strong></p>
                  <ul>
                    <li>Lorem Ipsum</li>
                    <li>Lorem Ipsum</li>
                    <li>Lorem Ipsum</li>
                    <li>Lorem Ipsum</li>
                  </ul>
                </div>
                <p className={styles.formFields}>
                    <Required /><br />
                    <label> <input type="checkbox" value="yes" checked={acceptTOS}
                        onChange={(e:any) => setAcceptTOS(e.target.checked)} />
                        &nbsp;I have read and agree to the Affiliate Terms of Service
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

export default Form_ContactUs
