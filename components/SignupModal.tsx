import React, { FormEvent, useState } from 'react';
import axios from 'axios';
import classNames from 'clsx';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useTurnstile } from '@/components/Turnstile';

import styles from './SignupModal.module.css';
import PanaButton from './PanaButton';

function SignupModalInner() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [signup_type, setSignupType] = useState('');
  const { t } = useTranslation('toast');
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const {
    token: turnstileToken,
    reset: resetTurnstile,
    Widget: TurnstileWidget,
  } = useTurnstile(turnstileSiteKey, 'newsletter_signup');

  const isProductionSite =
    process.env.NEXT_PUBLIC_HOST_URL?.includes('panamia.club') ?? false;

  async function submitSignupForm(e: FormEvent) {
    e.preventDefault();
    validateSignupForm();
    await postSignupForm();
  }

  async function signupConfirmation() {}

  async function postSignupForm() {
    if (email) {
      const res = await axios
        .post(
          '/api/createSignup',
          { name, email, signup_type, turnstileToken },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }
        )
        .then(async (response) => {
          if (response.data.error) {
            toast({
              title: t('error'),
              description: response.data.error,
              variant: 'destructive',
            });
          } else {
            signupConfirmation();
            setName('');
            setEmail('');
            setSignupType('');
            resetTurnstile();
            toast({
              title: t('success'),
              description: t('signupSuccess'),
            });
            toggleModal();
          }
        })
        .catch((error) => {
          console.log(error);
          toast({
            title: t('error'),
            description: t('submissionErrorFormGeneric', {
              error: error.message,
            }),
            variant: 'destructive',
          });
          toggleModal();
        });
      console.log(res);
    }
  }

  function validateSignupForm() {
    if (email.length < 5) {
    }
  }

  function toggleModal() {
    let dialog = document.getElementById('dialog-signup') as HTMLDialogElement;
    if (dialog instanceof HTMLDialogElement) {
      if (dialog.open) {
        dialog.close();
      } else {
        dialog.showModal();
      }
    }
  }

  function onSignupTypeChange(e: FormEvent) {
    const signupChange = (e.target as HTMLInputElement).value;
    if (e.target) setSignupType(signupChange);
  }

  return (
    <div>
      <PanaButton
        onClick={
          isProductionSite
            ? toggleModal
            : () => window.open('https://www.panamia.club', '_blank')
        }
        text={
          isProductionSite ? 'Sign Up for our Newsletter' : 'Visit panamia.club'
        }
        color="pink"
        hoverColor="pink"
      />
      <dialog id="dialog-signup" className={styles.modal}>
        <div className={styles.modal__title}>
          {isProductionSite
            ? "You're Invited To Our Club!"
            : '[!] Test Site Only'}
        </div>
        <div className={styles.modal__subtitle}>
          {isProductionSite
            ? "Welcome to Pana MIA Club, the SoFlo Local's Directory connecting you to your vibrant community creatives, small businesses and organizations"
            : 'This is a testing/development site. For the official Pana MIA Club, please visit panamia.club'}
        </div>
        {isProductionSite ? (
          <form
            id="form-signup"
            className={styles.modal__fields}
            onSubmit={submitSignupForm}
          >
            <p>
              <label className={styles.label__field}>Full Name</label>
              <br />
              <input
                type="text"
                name="name"
                className={styles.field__input}
                maxLength={75}
                placeholder="Your Name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
              />
            </p>
            <p>
              <label className={styles.label__field}>Email Address</label>
              <br />
              <input
                type="email"
                name="email"
                className={styles.field__input}
                maxLength={100}
                placeholder="you@example.com"
                value={email}
                required
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
              />
            </p>
            <ul>
              <li>
                <strong>Which best describes you?</strong>
              </li>
              <li>
                <label>
                  <input
                    type="radio"
                    name="signup_type"
                    value="creative_biz_org"
                    onChange={onSignupTypeChange}
                    checked={signup_type == 'creative_biz_org'}
                  />
                  &emsp;I am a locally-based creative/business/organization
                </label>
              </li>
              <li>
                <label>
                  <input
                    type="radio"
                    name="signup_type"
                    value="resident_support"
                    onChange={onSignupTypeChange}
                    checked={signup_type == 'resident_support'}
                  />
                  &emsp;I am a South Florida resident interested in supporting
                  local
                </label>
              </li>
              <li>
                <label>
                  <input
                    type="radio"
                    name="signup_type"
                    value="visiting_florida"
                    onChange={onSignupTypeChange}
                    checked={signup_type == 'visiting_florida'}
                  />
                  &emsp;I'm visiting South Florida and want to engage with the
                  local scene
                </label>
              </li>
            </ul>
            {TurnstileWidget}
            <button
              type="submit"
              className={classNames(styles.button, styles.cta)}
              disabled={!turnstileToken}
            >
              Submit
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={toggleModal}
            >
              Close
            </button>
          </form>
        ) : (
          <div className={styles.modal__fields}>
            <p style={{ textAlign: 'center', margin: '2rem 0' }}>
              <strong>
                This is a development/testing environment.
                <br />
                Please visit the official site to sign up.
              </strong>
            </p>
            <a
              href="https://www.panamia.club"
              target="_blank"
              rel="noopener noreferrer"
              className={classNames(styles.button, styles.cta)}
              style={{ display: 'block', textAlign: 'center' }}
            >
              Go to panamia.club
            </a>
            <button
              type="button"
              className={styles.button}
              onClick={toggleModal}
            >
              Close
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}

export default function SignupModal() {
  return <SignupModalInner />;
}
