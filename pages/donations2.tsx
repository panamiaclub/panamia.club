import React, { useState, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import styles from '../styles/Donations2.module.css'
import PageMeta from '../components/PageMeta';
import { IconPlant } from '@tabler/icons';

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

const DonatePage: React.FC = () => {
  const [amount, setAmount] = useState(0);
  const [comment, setComment] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const customAmountInputRef = useRef<HTMLInputElement>(null);
  const predefinedAmounts = [25, 50, 100, 250, 500, 1000, 2500];

  const focusCustomAmountInput = () => {
    if (customAmountInputRef.current) {
      customAmountInputRef.current.focus();
    }
  };


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripePromise) {
      console.error('Stripe is not properly initialized');
      return;
    }
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount * 100,
        isRecurring,
        customerEmail: isAnonymous ? null : 'customer@example.com',
        comment,
      }),
    });
    const { sessionId } = await response.json();
    const stripe = await stripePromise;
    if (stripe) {
      stripe.redirectToCheckout({ sessionId });
    } else {
      console.error('Stripe instance could not be initialized');
    }
  };

  return (
    <main className={styles.app}>
      <PageMeta
        title="Support Us Through Donations"
        desc="Help support us through donations which are used for events, campaigns and community support."
      />
      <div className={styles.main}>
        <section className={styles.header}>
          <h2>Make a Donation</h2>
          <form onSubmit={handleSubmit} className={styles.donateForm}>
            <div>
              <IconPlant size={32} stroke={1.5} />
              <span>Yes! I'd like to empower youth and nourish community with a gift.</span>
            </div>
            <h5><strong>Donation Frequency *</strong></h5>
            <div className={styles.donationTypeButtons}>
              <button
                type="button"
                onClick={() => setIsRecurring(false)}
                className={isRecurring ? styles.donationTypeButton : styles.donationTypeButtonActive}
                aria-label={"Make a one-time donation"}
              >
                ONE-TIME DONATION
              </button>
              <button
                type="button"
                onClick={() => setIsRecurring(true)}
                className={isRecurring ? styles.donationTypeButtonActive : styles.donationTypeButton}
                aria-label={"Make a monthly recurring donation"}
              >
                MONTHLY DONATION
              </button>
            </div>
            <h5><strong>I will donate *</strong></h5>
            <div className={styles.buttonGroup}>
              {predefinedAmounts.map((presetAmount) => (
                <button
                  type="button"
                  key={presetAmount}
                  onClick={() => setAmount(presetAmount)}
                  className={styles.donateButton}
                  aria-label={"donate " + presetAmount + " dollars"}
                >
                  ${presetAmount}
                </button>
              ))}
              <button
                type="button"
                onClick={focusCustomAmountInput}
                className={styles.donateButton}
                aria-label="Choose custom donation amount"
              >
                OTHER
              </button>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.customAmountWrapper}>
                <span>$</span>
                <input
                  ref={customAmountInputRef}
                  type="number"
                  placeholder="Custom Amount"
                  value={amount !== 0 ? amount : ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className={styles.customAmountInput}
                />
              </label>
            </div>
            <div className={styles.formGroup}>
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={styles.commentTextarea}
                placeholder="Any comment?"
              ></textarea>
            </div>
            <div className={styles.formGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className={styles.checkboxInput}
                />Donate Anonymously
              </label>
            </div>
            <button type="submit" className={styles.submitBtn}>BECOME A SPONSOR</button>
          </form>
        </section>
        <div className={styles.footer}></div>
      </div>
    </main>
  );
};

export default DonatePage;