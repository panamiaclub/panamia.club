import type { NextPage } from 'next'
import React, {  useState, FormEvent } from 'react';
import axios from 'axios';
import classNames from 'classnames';

import styles from '@/styles/form/StandardForm.module.css'
import PageMeta from '@/components/PageMeta';
import PanaLogoLong from '@/components/PanaLogoLong';
import Required from '@/components/Form/Required';
import PanaButton from '@/components/PanaButton';

const Form_BecomeAPana: NextPage = () => {

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [locally_based, setLocallyBased] = useState("");
  const [details, setDetails] = useState("");
  const [background, setBackground] = useState("");
  const [socials_website, setSocialsWebsite] = useState("");
  const [socials_instagram, setSocialsInstagram] = useState("");
  const [socials_facebook, setSocialsFacebook] = useState("");
  const [socials_spotify, setSocialsSpotify] = useState("");
  const [socials_tiktok, setSocialsTiktok] = useState("");
  const [socials_twitter, setSocialsTwitter] = useState("");
  const [phone_number, setPhoneNumber] = useState("");
  const [whatsapp_community, setWhatsappCommunity] = useState(false);
  const [pronouns_sheher, setPronounsSheher] = useState(false);
  const [pronouns_hehim, setPronounsHehim] = useState(false);
  const [pronouns_theythem, setPronounsTheythem] = useState(false);
  const [pronouns_none, setPronounsNone] = useState(false);
  const [pronouns_other, setPronounsOther] = useState(false);
  const [pronouns_otherdesc, setPronounsOtherdesc] = useState("");
  const [five_words, setFiveWords] = useState("");
  const [tags, setTags] = useState("");


  const createExpressProfile = async() => {
    const socials = {
        website: socials_website,
        instagram: socials_instagram,
        facebook: socials_facebook,
        spotify: socials_spotify,
        tiktok: socials_tiktok,
        twitter: socials_twitter,
    };
    const pronouns = {
        "sheher": pronouns_sheher,
        "hehim": pronouns_hehim,
        "theythem": pronouns_theythem,
        "none": pronouns_none,
        "other": pronouns_other,
        "other_desc": pronouns_otherdesc,
    };
    const response = await axios
        .post(
            "/api/createExpressProfile",
            {
                email: email,
                name: name,
                locally_based: locally_based,
                details: details,
                background: background,
                socials: socials,
                phone_number: phone_number,
                whatsapp_community: whatsapp_community,
                pronouns: pronouns,
                five_words: five_words,
                tags: tags,
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

  function validateExpressProfile() {
      if (email.length < 5 ) {
          alert('Please enter a valid email address.');
          return false;
      }
      return true;
  }

  async function submitExpressProfile(e: FormEvent) {
    e.preventDefault();
    if (validateExpressProfile()) {
        const response = await createExpressProfile();
        if (response) {
            if(response.data.error) {
                alert(response.data.error);
            } else {
                console.log(response.data.msg);
                window.location.href = "/form/become-a-pana-confirmation";
            }
        }
    }
  }

  return (
    <main className={styles.app}>
      <PageMeta
        title="Become a Pana"
        desc="Sign up to become a Pana and get the benefits of being listed on our directory!"
        />
      <div className={styles.main}>
        <div className={styles.formLogo}>
            <PanaLogoLong  color="blue" size="large" nolink={true} />
        </div>
        <h2 className={styles.formTitle}>Directory Express Sign Up Form</h2>
        <br />
        <h3>Why are you filling out this form?</h3>
        <p>We want to better understand your project and get a better sense of your needs. Some of 
          this information will be for internal use and the some will be published publicly on our directory. Once our Keyword-Searchable Directory is up 
          on our website you will have the ability to edit your profiles as needed! In the meantime, you can view our current&nbsp; 
          <a href="https://docs.google.com/spreadsheets/d/1FWh_LIroPsu_0Xej-anP0RuIBDp6k8l1cfJ0pq8dQjY">Directory Sheet</a></p>
        <p><strong>Please answer to the best of your ability. You are welcome to create more than
          one profile if you have separate projects- just make sure to use a different email.</strong></p>
        <p><em>If you have questions please reach out to us at hola@panamia.club</em></p>
        <p><Required notice={true}/></p>
        <section id="form-section" className={styles.outerGradientBox}>
            <form id="form-form" className={styles.innerGradientBox} onSubmit={submitExpressProfile}>
                <br/>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Email Address <Required /></label><br />
                    <input type="email" name="email"
                        maxLength={100} placeholder="you@example.com" value={email} required onChange={(e:any) => setEmail(e.target.value)} />
                    <small>The email that will be used for signing in</small>
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Name of your self, Business, Project, or Org <Required /></label><br />
                    <input type="text" name="name" maxLength={75} placeholder="Name" required
                        value={name} onChange={(e:any) => setName(e.target.value)} />
                    <small>This name will display as the Title of your profile</small>
                </p>
                <div className={styles.formFields}>
                    <ul>
                        <li>
                            <strong>Are you (the creator, director, owner, CEO) locally-based or are a native of South Florida? <Required /></strong>
                            <br /><small>South Florida is Miami-Dade, Broward and Palm Beach County</small>
                        </li>
                        <li>
                            <label>
                            <input type="radio" name="locally_based" value="yes" required 
                                onChange={(e:any) => setLocallyBased(e.target.value)} checked={locally_based == "yes"} />
                            &emsp;I am</label>
                        </li>
                        <li>
                            <label>
                            <input type="radio" name="locally_based" value="no" 
                                onChange={(e:any) => setLocallyBased(e.target.value)} checked={locally_based == "no"} />
                            &emsp;I'm not (and therefore do not qualify to be a member of this club)</label>
                        </li>
                        <li>
                            <label>
                            <input type="radio" name="locally_based" value="other" 
                                onChange={(e:any) => setLocallyBased(e.target.value)} checked={locally_based == "other"} />
                            &emsp;Other (please message us with details)</label>
                        </li>
                    </ul>
                </div>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Explain your project in detail: <Required />
                    <br /></label><br />
                    <textarea name="details" maxLength={500} placeholder="Project Details" required rows={4}
                        value={details} onChange={(e:any) => setDetails(e.target.value)} />
                        <small>This will be your intro to our users! Please include where you are based in SoFlo :)</small>
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>What is your background?</label>
                    <textarea name="background" maxLength={500} placeholder="Background" rows={4}
                        value={background} onChange={(e:any) => setBackground(e.target.value)} />
                    <br />
                    <small>*optional* one of our goals is to promote minority-led small businesses, we may focus on some  demographics depending on the week where your business may be relevant on our social media</small><br />
                </p>
                <div className={styles.formFields}>
                    <ul>
                        <li>
                            <strong>Website and Social Media</strong>
                            <br /><small>These will be displayed on your profile, please use the full URL for each</small>
                        </li>
                        <li className={styles.listSocialFields}>
                            <label>Website: <Required /></label>
                            <input type="text" name="socials_website" required placeholder="https://www.example-pana.com"
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
                            <label>Spotify:</label>
                            <input type="text" name="socials_tiktok"  placeholder="https://www.spotify.com/@example-pana"
                                value={socials_spotify} onChange={(e:any) => setSocialsSpotify(e.target.value)} />
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
                        maxLength={15} placeholder="(###) ###-####" value={phone_number} onChange={(e:any) => setPhoneNumber(e.target.value)} />
                    <small>Used for contacting you</small>
                    <label> <input type="checkbox" value="yes" checked={whatsapp_community}
                        onChange={(e:any) => setWhatsappCommunity(e.target.checked)} />
                        I'm interested in the WhatsApp community chat/forum for directory members
                    </label>
                </p>
                <div className={styles.formFields}>
                    <ul>
                        <li>
                            <strong>What are your preferred pronouns?</strong><br />
                            <small>If you are an Individual (not representing a group or org)</small>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_sheher" value="she/her" 
                            checked={pronouns_sheher} onChange={(e:any) => setPronounsSheher(!pronouns_sheher)} />
                            &emsp;She/Her</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_hehim" value="he/him" 
                            checked={pronouns_hehim} onChange={(e:any) => setPronounsHehim(!pronouns_hehim)} />
                            &emsp;He/Him</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_theythem" value="they/them" 
                            checked={pronouns_theythem} onChange={(e:any) => setPronounsTheythem(!pronouns_theythem)} />
                            &emsp;They/Them</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_none" value="no preference" 
                            checked={pronouns_none} onChange={(e:any) => setPronounsNone(!pronouns_none)} />
                            &emsp;No Preference</label>
                        </li>
                        <li>
                            <label>
                            <input type="checkbox" name="pronouns_other" value="other" 
                            checked={pronouns_other} onChange={(e:any) => setPronounsOther(!pronouns_other)} />
                            &emsp;Other:</label>
                            <input type="text" hidden={!pronouns_other} 
                            value={pronouns_otherdesc} onChange={(e:any) => setPronounsOtherdesc(e.target.value)} />
                        </li>
                    </ul>
                </div>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Give us five words that describes your business/services: <Required /></label><br />
                    <input type="text" name="five_words" maxLength={100} placeholder="" required
                        value={five_words} onChange={(e:any) => setFiveWords(e.target.value)} />
                </p>
                <p className={styles.formFields}>
                    <label className={styles.label__field}>Please provide a list of tags people can find you with in our directory</label><br />
                    <input type="text" name="tags"
                        maxLength={250} placeholder="" value={tags} onChange={(e:any) => setTags(e.target.value)} />
                    <small>Example (The Dancing Elephant): Spiritual/Metaphysical, Books, Bookstore, Retail Shop</small>
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

export default Form_BecomeAPana
