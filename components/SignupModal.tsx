import { FormEvent, useState } from 'react';
import axios from "axios";
import classNames from 'classnames';

import styles from './SignupModal.module.css';
import PanaButton from './PanaButton';

export default function SignupModal() {

    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [signup_type, setSignupType] = useState("");

    function submitSignupForm(e: FormEvent) {
        validateSignupForm();
        postSignupForm();
        e.preventDefault();
    }

    async function signupConfirmation() {
        const res = await axios
            .post(
                "/api/sendSignup",
                { name, email, signup_type},
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

    async function postSignupForm() {
        if (email){
            const res = await axios
            .post(
                "/api/createSignup",
                { name, email, signup_type},
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
                    signupConfirmation();
                    setName("");
                    setEmail("");
                    setSignupType("");
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

    function validateSignupForm() {
        if (email.length < 5 ) {
            
        }
    }

    function toggleModal() {
        let dialog = document.getElementById('dialog-signup') as HTMLDialogElement;
        if (dialog instanceof HTMLDialogElement) {
            if (dialog.open) {
                dialog.close();
            }
            else {
                dialog.showModal();
            }
        }
    }

    function onSignupTypeChange(e: FormEvent) {
        const signupChange = (e.target as HTMLInputElement).value
        if (e.target) setSignupType(signupChange);
    }

    return (
        <div>
            <PanaButton 
                onClick={toggleModal}
                text="Sign Up for our Newsletter"
                color="pink" />
            <dialog id="dialog-signup" className={styles.modal}>
                <div className={styles.modal__title}>You're Invited To Our Club!</div>
                <div className={styles.modal__subtitle}>Welcome to Pana MIA Club, the SoFlo Local's Directory connecting you to your vibrant community creatives, small businesses and organizations</div>
                <form id="form-signup" className={styles.modal__fields} onSubmit={submitSignupForm}>
                    <p>
                        <label className={styles.label__field}>Full Name</label><br />
                        <input type="text" name="name" className={styles.field__input} 
                            maxLength={75} placeholder="Your Name" value={name} onChange={(e:any) => setName(e.target.value)} />
                    </p>
                    <p>
                        <label className={styles.label__field}>Email Address</label><br />
                        <input type="email" name="email" className={styles.field__input}
                            maxLength={100} placeholder="you@example.com" value={email} required onChange={(e:any) => setEmail(e.target.value)} />
                    </p>
                    <ul>
                        <li><strong>Which best describes you?</strong></li>
                        <li><label>
                            <input type="radio" name="signup_type" value="creative_biz_org" onChange={onSignupTypeChange} checked={signup_type == "creative_biz_org"} />
                            &emsp;I am a locally-based creative/business/organization</label></li>
                        <li><label>
                            <input type="radio" name="signup_type" value="resident_support" onChange={onSignupTypeChange} checked={signup_type == "resident_support"} />
                            &emsp;I am a South Florida resident interested in supporting local</label></li>
                        <li><label>
                            <input type="radio" name="signup_type" value="visiting_florida" onChange={onSignupTypeChange} checked={signup_type == "visiting_florida"} />
                            &emsp;I'm visiting South Florida and want to engage with the local scene</label></li>
                    </ul>
                    <button type="submit" className={classNames(styles.button, styles.cta)}>Submit</button>
                    <button type="button" className={styles.button} onClick={toggleModal}>Close</button>
                </form>
            </dialog>
        </div>
    );
}