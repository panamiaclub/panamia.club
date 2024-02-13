import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import styles from '../styles/Donations2.module.css';
import PageMeta from '../../components/PageMeta';
import { IconPlant, IconMedal, IconTrophy, IconCrown, } from '@tabler/icons';
import PanaButton from '../../components/PanaButton';

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const preAmounts = [25, 40, 100, 250, 500, 1000, 2500];
const monthPreAmounts = [10, 15, 25];

const GridCheck = () => {
  return (
    <span className={styles.gridCheck} title="Checked">&#10003;</span>
  )
}
const GridNotCheck = () => {
  return (
    <span className={styles.gridNotCheck} title="Not Checked">-</span>
  )
}


const Event_Panimo2024: React.FC = () => {


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;
    if (!stripePromise) {
      console.error('Stripe is not properly initialized');
      return;
    }
  };

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
      </div>
    </main>
  );
};

export default Event_Panimo2024;