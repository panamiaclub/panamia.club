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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const createContactUs = async() => {
    const response = await axios
        .post(
            "/api/createContactUs",
            {
                name: name,
                email: email,
                message: message,
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

  function validateContactUs() {
    if (email.length < 5 ) {
        alert('Please enter a valid email address.');
        return false;
    }
    return true;
  }

  async function submitContactUs(e: FormEvent) {
    e.preventDefault();
    if (validateContactUs()) {
        const response = await createContactUs();
        if (response) {
            if(response.data.error) {
                alert(response.data.error);
            } else {
              setName("");
              setEmail("");
              setMessage("");
              alert('Your message has been submitted!');
            }
        }
    }
  }

  return (
    <main className={styles.app}>
      <PageMeta
        title="Contact Us"
        desc="Send us a message with any questions you have for us."
        />
      <div className={styles.main}>
        <div className={styles.formLogo}>
            <PanaLogoLong  color="blue" size="large" nolink={true} />
        </div>
        <h2 className={styles.formTitle}>Contact Us</h2>
        <p>Looking for answers? Check out our <Link href="/#home-faq">Frequently Asked Questions</Link> or
          learn more about who we are on our <Link href="/about-us/">About Us</Link> page.</p>
        <p>Please let us know if you have any questions for us. We'll reach out to you 
          as soon as we can provide an answer.</p>
        <p><Required notice={true}/></p>
        <section id="form-section" className={styles.outerGradientBox}>
            <form id="form-form" className={styles.innerGradientBox} onSubmit={submitContactUs}>
                <br/>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Your Name <Required /></label><br />
                    <input type="text" name="name" maxLength={75} placeholder="Name" required
                        value={name} onChange={(e:any) => setName(e.target.value)} />
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Email Address <Required /></label><br />
                    <input type="email" name="email"
                        maxLength={100} placeholder="you@example.com" value={email} required onChange={(e:any) => setEmail(e.target.value)} />
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Message or Questions <Required /></label>
                    <textarea name="message" maxLength={75} required
                        placeholder="Your message or questions you have for us" rows={4}
                        value={message} onChange={(e:any) => setMessage(e.target.value)} />
                    <br />
                </p>
                <p className={styles.formSubmitFields}>
                    <PanaButton text="&emsp;Submit Form&emsp;" color="pink" submit={true} />
                </p>
            </form>
          </section>
        </div>
    </main>
  )
}

export default Form_ContactUs
