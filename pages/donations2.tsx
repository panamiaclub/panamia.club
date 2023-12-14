import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import styles from '../styles/Donations2.module.css';
import PageMeta from '../components/PageMeta';
import { IconPlant, IconMedal, IconTrophy, IconCrown, IconUser } from '@tabler/icons';
import DropDownBtn from '../components/DropDownBtn';
import PanaButton from '../components/PanaButton';

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

const DonatePage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(0);
  const [allReqFields, setAllReqFields] = useState(false);
  const [comment, setComment] = useState('');
  const [dedicate, setDedicate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isOther, setIsOther] = useState(false);
  const customAmountInputRef = useRef<HTMLInputElement>(null);
  const preAmounts = [25, 40, 100, 250, 500, 1000, 2500];
  const monthPreAmounts = [10, 15, 25];
  const amountsToUse = isRecurring ? [] : preAmounts;
  let monthlyTier = 0;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmailValid = emailRegex.test(email);
    return isEmailValid;
  };

  if (amount >= 25) {
    monthlyTier = 3;
  } else if (amount >= 15 && amount < 25) {
    monthlyTier = 2;
  } else if (amount >= 10 && amount < 15) {
    monthlyTier = 1;
  }

  //Pending Replace useEffects
  useEffect(() => {
    setIsOther(!preAmounts.includes(amount) && !monthPreAmounts.includes(amount));
  }, [amount, preAmounts, monthPreAmounts]);

  useEffect(() => {
    const isValid = validateEmail(email) && amount > 0;
    setAllReqFields(isValid);
  }, [email, amount]);

  const focusCustomAmountInput = () => {
    if (customAmountInputRef.current) {
      customAmountInputRef.current.focus();
    }
    setAmount(0)
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
        customerEmail: email,
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
          <div className={styles.donationsContent}>
            <form onSubmit={handleSubmit} className={styles.donateForm}>
              <div>
                <h3>Support Our Club</h3>
                <div className={styles.donationIntro}>
                  <p>Pana MIA Club works hard towards our vision for a unified 
                    local SoFlo community everyday. We know we can do it with your help! You can 
                    support us by funding our mission with a one-time donation or by joining our 
                    community of supporters called Gente dePana! Our Gente dePana subscribers are 
                    the foundation of Pana MIA's sustainability, monthly contributions allow us 
                    to make bigger strides in our projects to support the local community. In 
                    return, our Gente are rewarded with so many benefits, discounts and perks 
                    that give you special access to all things Pana!</p>
                </div>
                <br />
                <p><strong>If you're committed to supporting the local South Florida community, 
                    become a Gente de Pana!</strong></p>
              </div>
              <br />
              <table className={styles.mobileSubsTiers}>
                <tbody>
                  <tr>
                    <td>
                      <IconMedal size={64} stroke={1.5} />
                      <p><b>TIER 1</b></p>
                      <p>Sponsor a kid for a FunkyTown field trip.</p>
                      <DropDownBtn
                        title="Donate $10/mo"
                        color={(monthlyTier == 1 && isRecurring) ? "navy" : "gray"}
                        hoverColor="navy"
                        type="button"
                        dropdown={
                          <ul>
                            <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                            <li>Access to PanaPro features on Pana MIA's website</li>
                            <li>5% discount on Pana MIA and affiliated events</li>
                            <li>10% discount on Pana MIA merch</li>
                          </ul>
                        }
                        onClick={() => { setAmount(10); setIsRecurring(true); }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <IconTrophy size={64} stroke={1.5} />
                      <p><b>TIER 2</b></p>
                      <p>Cover the cost of one family to participate in a cooking workshop.</p>
                      <DropDownBtn
                        title="Donate $15/mo"
                        color={(monthlyTier == 2 && isRecurring) ? "navy" : "gray"}
                        hoverColor="navy"
                        type="button"
                        dropdown={
                          <ul>
                            <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                            <li>Access to PanaPro features on Pana MIA's website</li>
                            <li>Gente dePana Card (discounts/special access to local goods,services,events)</li>
                            <li>10% discount on Pana MIA and affiliated events</li>
                            <li>10% discount on Pana MIA merch</li>
                          </ul>
                        }
                        onClick={() => { setAmount(15); setIsRecurring(true); }}
                      />
                    </td>
                  </tr><tr>
                    <td>
                      <IconCrown size={64} stroke={1.5} />
                      <p><b>TIER 3</b></p>
                      <p>Host a Community Chef Cooking Demo at the Cowtown Farmer's Market.</p>
                      <DropDownBtn
                        title="Donate $25/mo"
                        color={(monthlyTier == 3 && isRecurring) ? "navy" : "gray"}
                        hoverColor="navy"
                        type="button"
                        dropdown={
                          <ul>
                            <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                            <li>Access to PanaPro features on Pana MIA's website</li>
                            <li>Gente dePana Card (discounts/special access to local goods,services,events)</li>
                            <li>First to know about Pana MIA developments</li>
                            <li>Invited into our Focus group pool to test new products</li>
                            <li>1 free ticket a month to select Pana MIA and affiliated events</li>
                            <li>10% discount on Pana MIA and affiliated events</li>
                            <li>10% discount on Pana MIA merch</li>
                          </ul>
                        }
                        onClick={() => { setAmount(25); setIsRecurring(true); }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <br />
              <table className={styles.desktopSubsTiers}>
                <tbody>
                  <tr>
                    <td>
                      <IconMedal size={64} stroke={1.5} color={'#4ab3ea'} />
                      <p><b>dePana</b></p>
                      <hr style={{ border: 'none', height: '1px', backgroundColor: '#4ab3ea' }} />
                      <PanaButton
                        text="Donate $10/mo"
                        color={(monthlyTier == 1 && isRecurring) ? "navy" : "gray"}
                        hoverColor="navy"
                        type="button"
                        onClick={() => { setAmount(10); setIsRecurring(true); }}
                      />
                      <ul>
                        <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                        <li>Access to PanaPro features on Pana MIA's website</li>
                        <li>5% discount on Pana MIA and affiliated events</li>
                        <li>10% discount on Pana MIA merch</li>
                      </ul>
                    </td>
                    <td>
                      <IconTrophy size={64} stroke={1.5} color='#fab22c' />
                      <p><b>Pana Confiado</b></p>
                      <hr style={{ border: 'none', height: '1px', backgroundColor: '#fab22c' }} />
                      <PanaButton
                        text="Donate $15/mo"
                        color={(monthlyTier == 2 && isRecurring) ? "navy" : "gray"}
                        hoverColor="navy"
                        type="button"
                        onClick={() => { setAmount(15); setIsRecurring(true); }}
                      />
                      <ul>
                        <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                        <li>Access to PanaPro features on Pana MIA's website</li>
                        <li>Gente dePana Card (discounts/special access to local goods,services,events)</li>
                        <li>10% discount on Pana MIA and affiliated events</li>
                        <li>10% discount on Pana MIA merch</li>
                      </ul>
                    </td>
                    <td>
                      <IconCrown size={64} stroke={1.5} color='#fc2070' />
                      <p><b>Pana Real</b></p>
                      <hr style={{ border: 'none', height: '1px', backgroundColor: '#fc2070' }} />
                      <PanaButton
                        text="Donate $25/mo"
                        color={(monthlyTier == 3 && isRecurring) ? "navy" : "gray"}
                        hoverColor="navy"
                        type="button"
                        onClick={() => { setAmount(25); setIsRecurring(true); }}
                      />
                      <ul>
                        <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                        <li>Access to PanaPro features on Pana MIA's website</li>
                        <li>Gente dePana Card (discounts/special access to local goods,services,events)</li>
                        <li>First to know about Pana MIA developments</li>
                        <li>Invited into our Focus group pool to test new products</li>
                        <li>1 free ticket a month to select Pana MIA and affiliated events</li>
                        <li>10% discount on Pana MIA and affiliated events</li>
                        <li>10% discount on Pana MIA merch</li>
                      </ul>
                    </td>
                  </tr>
                </tbody>
              </table>
              <br />
              <div className={styles.oneTime}>
                {!isRecurring && (
                  <PanaButton
                  text="One-Time Donation"
                  color={isRecurring ? "gray" : "navy"}
                  hoverColor="navy"
                  type="button"
                  onClick={() => setIsRecurring(false)} //Just in case we change it to always show
                />
                )}
                <br />
                <div className={styles.buttonGroup}>
                  {amountsToUse.map((presetAmount) => (
                    <PanaButton
                      text={"Donate " + "$" + presetAmount}
                      key={presetAmount}
                      color={(presetAmount == amount) ? "navy" : "gray"}
                      hoverColor="navy"
                      type="button"
                      onClick={() => setAmount(presetAmount)}
                    />
                  ))}
                  <PanaButton
                    text="Other"
                    color={isOther ? "navy" : "gray"}
                    hoverColor="navy"
                    type="button"
                    onClick={focusCustomAmountInput}
                  />
                </div>
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
                <label>
                  <select
                    className={styles.selectInput}
                    defaultValue=""
                    onChange={(e) => setDedicate(e.target.value)}
                  >
                    <option value="" disabled hidden>Dedicate donation to</option>
                    <option value="PanaVisión">PanaVisión</option>
                    <option value="Directory">Directory</option>
                    <option value="Merch Shop">Merch Shop</option>
                  </select>
                </label>
              </div>
              <div className={styles.formGroup}>
                <textarea
                  id="comment"
                  rows={1}
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
                <label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Enter your email"
                    className={styles.emailInput}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              </div>
              <div className={styles.submit}>
                <PanaButton
                  text="BECOME A SPONSOR"
                  color={allReqFields ? "pink" : "gray"}
                  hoverColor={allReqFields ? "navy" : "gray"}
                  type="submit"
                  disabled={!allReqFields}
                />
              </div>
            </form>
            <aside className={styles.verticalBanner}>
              <h3>GOAL/PROJECTS</h3>
              <p>Donation Goal</p>
              <h3>CURRENT SUBSCRIBERS</h3>
              <p>Growing Number Counter</p>
              <h3>BIGGEST DONATORS</h3>
              <table>
                <tbody>
                  <tr>
                    <td><IconUser size={64} stroke={1.5} /></td>
                    <td><IconUser size={64} stroke={1.5} /></td>
                    <td><IconUser size={64} stroke={1.5} /></td>
                  </tr>
                </tbody>
              </table>
            </aside>
          </div>
        </section>
        <div className={styles.footer}></div>
      </div>
    </main>
  );
};

export default DonatePage;