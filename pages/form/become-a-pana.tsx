import type { NextPage } from 'next'
import React, {  useState, FormEvent } from 'react';
import axios from 'axios';
import classNames from 'classnames';

import styles from '../../styles/form/BecomeAPana.module.css'
import PageMeta from '../../components/PageMeta';

const BecomeAPana: NextPage = () => {

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [locally_based, setLocallyBased] = useState("");
  const [details, setDetails] = useState("");
  const [background, setBackground] = useState("");
  const [socials_website, setSocialsWebsite] = useState("");
  const [socials_instagram, setSocialsInstagram] = useState("");
  const [socials_facebook, setSocialsFacebook] = useState("");
  const [socials_tiktok, setSocialsTiktok] = useState("");
  const [socials_twitter, setSocialsTwitter] = useState("");
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
              { name, email, locally_based, details, socials_website, phone_number, pronouns},
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
              { name, email, locally_based, details, background, socials_website, phone_number, pronouns, five_words, tags},
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
                <p className={styles.required}>* Indicates required question</p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Email Address</label><br />
                    <input type="email" name="email"
                        maxLength={100} placeholder="you@example.com" value={email} required onChange={(e:any) => setEmail(e.target.value)} />
                    <small>The email that will be used for signing in</small>
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Name/Name of your Business/Project/Org *</label><br />
                    <input type="text" name="name"
                        maxLength={75} placeholder="Name" value={name} onChange={(e:any) => setName(e.target.value)} />
                    <small>This name will display as the Title of your profile</small>
                </p>
                <div className={styles.formFields}>
                    <ul>
                        <li>
                            <strong>Are you (the creator/director/CEO, etc) locally-based or are a native of South Florida?</strong>*
                            <br /><small>(South Florida is Miami-Dade, Broward and West Palm Beach Counties)</small>
                        </li>
                        <li>
                            <label>
                            <input type="radio" name="locally_based" value="yes" onChange={onLocallyBasedChange} checked={locally_based == "yes"} />
                            &emsp;I am</label>
                        </li>
                        <li>
                            <label>
                            <input type="radio" name="locally_based" value="no" onChange={onLocallyBasedChange} checked={locally_based == "no"} />
                            &emsp;I'm not (and therefore do not qualify to be a member of this club)</label>
                        </li>
                        <li>
                            <label>
                            <input type="radio" name="locally_based" value="other" onChange={onLocallyBasedChange} checked={locally_based == "other"} />
                            &emsp;Other (please message us with details)</label>
                        </li>
                    </ul>
                </div>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Explain your project in detail:*
                    <br /></label><br />
                    <textarea name="details" maxLength={75} placeholder="Project Details"
                        value={details} onChange={(e:any) => setDetails(e.target.value)} />
                        <small>This will be your intro to our users! Please include where you are based in SoFlo :)</small>
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>What is your background?</label>
                    <textarea name="background" maxLength={75} placeholder="Background"
                        value={background} onChange={(e:any) => setBackground(e.target.value)} />
                    <br />
                    <small>*optional* one of our goals is to promote minority-led small businesses, we may focus on some  demographics depending on the week where your business may be relevant on our social media</small><br />
                </p>
                <div className={styles.formFields}>
                    <ul>
                        <li>
                            <strong>Website and Social Media</strong>*
                            <br /><small>These will be displayed on your profile</small>
                        </li>
                        <li className={styles.listSocialFields}>
                            <label>Website:</label>
                            <input type="text" name="socials_website" placeholder="https://www.example-pana.com"
                                value={socials_website} onChange={(e:any) => setSocialsWebsite(e.target.value)} />
                        </li>
                        <li className={styles.listSocialFields}>
                            <label>Instagram:</label>
                            <input type="text" name="socials_instagram" placeholder="https://www.instagram.com/example-pana/"
                                value={socials_instagram} onChange={(e:any) => setSocialsInstagram(e.target.value)} />
                        </li>
                        <li className={styles.listSocialFields}>
                            <label>Facebook:</label>
                            <input type="text" name="socials_facebook" placeholder="https://www.facebook.com/example-pana/"
                                value={socials_facebook} onChange={(e:any) => setSocialsFacebook(e.target.value)} />
                        </li>
                        <li className={styles.listSocialFields}>
                            <label>Tiktok:</label>
                            <input type="text" name="socials_tiktok"  placeholder="https://www.tiktok.com/@example-pana"
                                value={socials_tiktok} onChange={(e:any) => setSocialsTiktok(e.target.value)} />
                        </li>
                        <li className={styles.listSocialFields}>
                            <label>Twitter:</label>
                            <input type="text" name="socials_twitter"  placeholder="https://twitter.com/example-pana"
                                value={socials_twitter} onChange={(e:any) => setSocialsTwitter(e.target.value)} />
                        </li>
                    </ul>
                </div>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Phone Number</label><br />
                    <input type="text" name="phone_number"
                        maxLength={75} placeholder="Your Name" value={phone_number} onChange={(e:any) => setPhoneNumber(e.target.value)} />
                    <small>Used for contacting you</small>
                    <label> <input type="checkbox" value="yes" />I'm interested in the WhatsApp community chat/forum for directory members</label>
                </p>
                <div className={styles.formFields}>
                    <ul>
                        <li>
                            <strong>What are your preferred pronouns?</strong>*<br />
                            <small>If you are an Individual (not representing a group or org)</small>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_sheher" value="she/her" />
                            &emsp;She/Her</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_hehim" value="he/him" />
                            &emsp;He/Him</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_theythem" value="they/them" />
                            &emsp;They/Them</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_none" value="no preference" />
                            &emsp;No Preference</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_other" value="other" />
                            &emsp;Other:</label>
                        </li>
                    </ul>
                </div>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Give us five words that describes your business/services:*</label><br />
                    <input type="text" name="five_words"
                        maxLength={75} placeholder="" value={five_words} onChange={(e:any) => setFiveWords(e.target.value)} />
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Please provide a list of tags people can find you with in our directory</label><br />
                    <input type="text" name="tags"
                        maxLength={75} placeholder="" value={tags} onChange={(e:any) => setTags(e.target.value)} />
                    <small>Example (The Dancing Elephant): Spiritual/Metaphysical, Books, Bookstore, Retail Shop</small>
                </p>
                <button type="submit" className={classNames(styles.button, styles.cta)}>Submit</button>
            </form>
        </section>
      </div>
  </main>
  )
}

export default BecomeAPana
