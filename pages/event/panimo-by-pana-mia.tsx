import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { IconPlant, IconMedal, IconTrophy, IconCrown, } from '@tabler/icons';

import styles from '@/styles/event/Event.module.css';
import PageMeta from '@/components/PageMeta';
import PanaButton from '@/components/PanaButton';

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

const Event_Panimo2024: React.FC = () => {

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;
    if (!stripePromise) {
      console.error('Stripe is not properly initialized');
      return;
    }
  };
  
  // Event Description
  // Event Date & Time
  // Event Place

  return (
    <main className={styles.app}>
      <PageMeta
        title="Panimo By Pana MIA Club"
        desc="Panimo 2024 by Pana MIA Club is an eventful fundraiser"
      />
      <div className={styles.main}>
        <section className={styles.header}>
          <h2>Panimo 2024 by Pana MIA Club</h2>
        </section>
        <section>
          <p></p>
          <p>
            March 16th, 6pm to 2am
          </p>
          <address>
          228 NE 59 St,<br />
          Miami, FL 33137
          </address>
          <div className={styles.ticketSelection}>PreSale Ticket</div>
          <div className={styles.upsellSelection}>VIP</div>
          <div className={styles.upsellSelection}>Pana MIA T-Shirt</div>
        </section>
      </div>
    </main>
  );
};

export default Event_Panimo2024;