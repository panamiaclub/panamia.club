import { FormEvent, useState } from 'react';
import axios from "axios";
import styles from './NewsletterModal.module.css';
import classNames from 'classnames';

export default function NewsletterModal() {

    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const igUsername: string | null = null;
    const otherURL: string | null = null;
    const [membership_type, setMembershipType] = useState("");

    function submitNewsletterForm(e: FormEvent) {
        validateNewsletterForm();
        postNewsletterForm();
        e.preventDefault();
    }

    async function postNewsletterForm() {
        if (email){
            const res = await axios
            .post(
                "/api/createNewsletterEntry",
                { name, email, igUsername, otherURL, membership_type},
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
                    alert("Thank you for signing up!");
                    toggleModal();
                }
            })
            .catch((error) => {
                console.log(error);
                alert("There was a problem submitting the form: " + error.message);
                toggleModal();
            });
            console.log(res);
        }
    }

    function validateNewsletterForm() {
        if (email.length < 5 ) {
            
        }
    }

    function toggleModal() {
        let dialog = document.getElementById('dialog-newsletter') as HTMLDialogElement;
        if (dialog instanceof HTMLDialogElement) {
            if (dialog.open) {
                dialog.close();
            }
            else {
                dialog.showModal();
            }
        }
    }

    function onMembershipTypeChange(e: FormEvent) {
        if (e.target) setMembershipType((e.target as HTMLInputElement).value);
    }

    return (
        <div>
            <button className={styles.callToAction} onClick={toggleModal}>Sign Up for our Newsletter</button>
            <dialog id="dialog-newsletter" className={styles.modal}>
                <div className={styles.modal__title}>You're Invited To Our Club!</div>
                <div className={styles.modal__subtitle}>Welcome to Pana MIA Club, the SoFlo Local's Directory connecting you to your vibrant community creatives, small businesses and organizations</div>
                <form id="form-newsletter" className={styles.modal__fields} onSubmit={submitNewsletterForm}>
                    <p>
                        <label className={styles.label__field}>Full Name</label><br />
                        <input type="text" name="name" className={styles.field__input} 
                            maxLength={75} placeholder="Your Name" onChange={(e:any) => setName(e.target.value)} />
                    </p>
                    <p>
                        <label className={styles.label__field}>Email Address</label><br />
                        <input type="email" name="email" className={styles.field__input}
                            maxLength={100} placeholder="you@example.com" required onChange={(e:any) => setEmail(e.target.value)} />
                    </p>
                    <ul>
                        <li><strong>Which best describes you?</strong></li>
                        <li><label>
                            <input type="radio" name="membership_type" value="creative_biz_org" onChange={onMembershipTypeChange} checked={membership_type == "creative_biz_org"} />
                            &emsp;I am a locally-based creative/business/organization</label></li>
                        <li><label>
                            <input type="radio" name="membership_type" value="resident_support" onChange={onMembershipTypeChange} checked={membership_type == "resident_support"} />
                            &emsp;I am a South Florida resident interested in supporting local</label></li>
                        <li><label>
                            <input type="radio" name="membership_type" value="visiting_florida" onChange={onMembershipTypeChange} checked={membership_type == "visiting_florida"} />
                            &emsp;I'm visiting South Florida and want to engage with the local scene</label></li>
                    </ul>
                    <button type="submit" className={classNames(styles.button, styles.cta)}>Submit</button>
                    <button type="button" className={styles.button} onClick={toggleModal}>Close</button>
                </form>
            </dialog>
        </div>
    );
}