import type { NextPage } from 'next'
import React, {  useState, FormEvent } from 'react';
import axios from 'axios';
import classNames from 'classnames';

import styles from '../styles/BecomeAPana.module.css'
import PageMeta from '../components/PageMeta';

const BecomeAPana: NextPage = () => {

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [locally_based, setLocallyBased] = useState("");
  const [details, setDetails] = useState("");
  const [background, setBackground] = useState("");
  const [socials, setSocials] = useState("");
  const [phone_number, setPhoneNumber] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [five_words, setFiveWords] = useState("");
  const [tags, setTags] = useState("");


  function submitProfileForm(e: FormEvent) {
      validateProfileForm();
      postProfileForm();
      e.preventDefault();
  }

  async function profileConfirmation() {
      const res = await axios
          .post(
              "/api/sendSignup",
              { name, email, locally_based, details, socials, phone_number, pronouns},
              {
                  headers: {
                      Accept: "application/json",
                      "Content-Type": "application/json",
                  },
              }
          )
          .then(async (response) => {
              console.log(response);
          })
          .catch((error) => {
              console.log(error);
          });
  }

  async function postProfileForm() {
      if (email){
          const res = await axios
          .post(
              "/api/createExpressProfile",
              { name, email, locally_based, details, background, socials, phone_number, pronouns, five_words, tags},
              {
                  headers: {
                      Accept: "application/json",
                      "Content-Type": "application/json",
                  },
              }
          )
          .then(async (response) => {
              if (response.data.error) {
                  alert(response.data.error) // soft error should display for user to correct
              } else {
                  profileConfirmation();
                  setName("");
                  setEmail("");
                  setLocallyBased("");
                  alert("Thank you for signing up!");
              }
          })
          .catch((error) => {
              console.log(error);
              alert("There was a problem submitting the form: " + error.message);
          });
          console.log(res);
      }
  }

  function validateProfileForm() {
      if (email.length < 5 ) {
          
      }
  }


  function onLocallyBasedChange(e: FormEvent) {
      const locallyBasedChange = (e.target as HTMLInputElement).value
      if (e.target) setLocallyBased(locallyBasedChange);
  }

  return (
    <main className={styles.app}>
      <PageMeta
        title="Become a Pana"
        desc="Sign up to become a Pana and get the benefits of being listed on our directory!"
        image="https://www.panamia.club/logos/panamia_pink.svg"
        />
      <div className={styles.main}>
        <h2>Pana MIA's Directory Express Sign Up Form</h2>
        <br />
        <h3>Why are you filling out this form?</h3>
        <p>We want to better understand your project and get a better sense of your needs. Some of 
          this information will be for internal use and the some will be published publicly on our directory. Once our Keyword-Searchable Directory is up 
          on our website you will have the ability to edit your profiles as needed! In the meantime, you can view our current&nbsp; 
          <a href="https://docs.google.com/spreadsheets/d/1FWh_LIroPsu_0Xej-anP0RuIBDp6k8l1cfJ0pq8dQjY">Directory Sheet</a></p>
        <p><strong>Please answer to the best of your ability. You are welcome to create more than
          one profile if you have separate projects- just make sure to use a different email.</strong></p>
        <p><em>If you have questions please reach out to us at hola@panamia.club</em></p>
        <section id="dialog-signup" className={styles.modal}>
            <form id="form-signup" className={styles.modal__fields} onSubmit={submitProfileForm}>
                <p>* Indicates required question</p>
                <p>
                    <label className={styles.label__field}>Email Address</label><br />
                    <input type="email" name="email" className={styles.field__input}
                        maxLength={100} placeholder="you@example.com" value={email} required onChange={(e:any) => setEmail(e.target.value)} />
                </p>
                <p>
                    <label className={styles.label__field}>Name/Name of your Business/Project/Org *</label><br />
                    <input type="text" name="name" className={styles.field__input} 
                        maxLength={75} placeholder="Your Name" value={name} onChange={(e:any) => setName(e.target.value)} />
                </p>
                <ul>
                    <li><strong>Are you (the creator/director/CEO, etc) locally-based or are a native of South Florida?</strong>*
                      <br /><small>(South Florida is Miami-Dade, Broward and West Palm Beach Counties)</small></li>
                    <li><label>
                        <input type="radio" name="signup_type" value="yes" onChange={onLocallyBasedChange} checked={locally_based == "yes"} />
                        &emsp;I am</label></li>
                    <li><label>
                        <input type="radio" name="signup_type" value="no" onChange={onLocallyBasedChange} checked={locally_based == "no"} />
                        &emsp;I’m not (and therefore do not qualify to be a member of this club)</label></li>
                    <li><label>
                        <input type="radio" name="signup_type" value="other" onChange={onLocallyBasedChange} checked={locally_based == "other"} />
                        &emsp;Other (please message us with details)</label></li>
                </ul>
                <p>
                    <label className={styles.label__field}>Explain your project in detail (This will be your intro to our users!):*
                    <br /><small>Please include where you are based in SoFlo :)</small></label><br />
                    <textarea name="details" className={styles.field__input} 
                        maxLength={75} placeholder="Project Details" value={details} onChange={(e:any) => setDetails(e.target.value)} />
                </p>
                <button type="submit" className={classNames(styles.button, styles.cta)}>Submit</button>
            </form>
        </section>
      </div>
  </main>
  )
}

export default BecomeAPana
