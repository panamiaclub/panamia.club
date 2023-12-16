import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import styles from '../styles/Donations2.module.css';
import PageMeta from '../components/PageMeta';
import { IconPlant, IconMedal, IconTrophy, IconCrown, IconUser, IconStar, IconCheck } from '@tabler/icons';
import DropDownBtn from '../components/DropDownBtn';
import PanaButton from '../components/PanaButton';

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

const TierBadge = ({tier}: {tier: number}) => {
 if (tier === 1) {
  return (
    <div className={styles.tierBadge}>
      <span className={styles.tier1Badge}><IconMedal size="20" /> dePana</span>
    </div>
  )
 }
 if (tier === 2) {
  return (
    <div className={styles.tierBadge}>
      <span className={styles.tier2Badge}><IconTrophy size="20" /> Pana Confiado</span>
    </div>
  )
 }
 if (tier === 3) {
  return (
    <div className={styles.tierBadge}>
      <span className={styles.tier3Badge}><IconCrown size="20" /> Pana Real</span>
    </div>
  )
 }
 return (<><small>None</small></>)
}

const DonatePage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(0.00);
  const [allReqFields, setAllReqFields] = useState(false);
  const [comment, setComment] = useState('');
  const [dedicate, setDedicate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isOther, setIsOther] = useState(false);
  const customAmountInputRef = useRef<HTMLInputElement>(null);
  const amountsToUse = isRecurring ? [] : preAmounts;
  let monthlyTier = 0;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmailValid = emailRegex.test(email);
    return isEmailValid;
  };

  if (isRecurring && amount >= 25) {
    monthlyTier = 3;
  } else if (isRecurring && amount >= 15 && amount < 25) {
    monthlyTier = 2;
  } else if (isRecurring && amount >= 10 && amount < 15) {
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
    const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;
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
        dedicate,
        comment,
        monthlyTier
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
                <p><strong>If you're committed to supporting the local South Florida community, 
                    become a Gente de Pana!</strong></p>
              </div>
              <table className={styles.mobileSubsTiers}>
                <tbody>
                  <tr>
                    <td>
                      <IconMedal size={64} stroke={1.5} />
                      <p><b>dePana</b></p>
                      <ul>
                        <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                        <li>Access to PanaPro features on Pana MIA's website</li>
                        <li>5% discount on Pana MIA and affiliated events</li>
                        <li>10% discount on Pana MIA merch</li>
                      </ul>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <IconTrophy size={64} stroke={1.5} />
                      <p><b>Pana Confiado</b></p>
                      <ul className={styles.mobileTierDetails}>
                        <li>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</li>
                        <li>Access to PanaPro features on Pana MIA's website</li>
                        <li>Gente dePana Card (discounts/special access to local goods,services,events)</li>
                        <li>10% discount on Pana MIA and affiliated events</li>
                        <li>10% discount on Pana MIA merch</li>
                      </ul>
                    </td>
                  </tr><tr>
                    <td>
                      <IconCrown size={64} stroke={1.5} />
                      <p><b>Pana Real</b></p>
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
              <table className={styles.donationCompareTable}>
                <thead>
                  <tr>
                    <th></th>
                    <th>
                      <IconMedal size={64} stroke={1.5} /><br />
                      dePana
                    </th>
                    <th>
                      <IconTrophy size={64} stroke={1.5} /><br />
                      Pana Confiado
                    </th>
                    <th>
                      <IconCrown size={64} stroke={1.5} /><br />
                      Pana Real
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Access to exclusive video + newsletter content (PanaVizión & LeoLero)</td>
                    <td><GridCheck /></td>
                    <td><GridCheck /></td>
                    <td><GridCheck /></td>
                  </tr>
                  <tr>
                    <td>Access to PanaPro features on Pana MIA's website</td>
                    <td><GridCheck /></td>
                    <td><GridCheck /></td>
                    <td><GridCheck /></td>
                  </tr>
                  <tr>
                    <td>Discount on Pana MIA merch</td>
                    <td>10%</td>
                    <td>10%</td>
                    <td>10%</td>
                  </tr>
                  <tr>
                    <td>Discount on Pana MIA and affiliated events</td>
                    <td>5%</td>
                    <td>10%</td>
                    <td>10%</td>
                  </tr>
                  <tr>
                    <td>Gente dePana Card (discounts/special access to local goods,services,events)</td>
                    <td><GridNotCheck /></td>
                    <td><GridCheck /></td>
                    <td><GridCheck /></td>
                  </tr>
                  <tr>
                    <td>1 free ticket a month to select Pana MIA and affiliated events</td>
                    <td><GridNotCheck /></td>
                    <td><GridNotCheck /></td>
                    <td><GridCheck /></td>
                  </tr>
                  <tr>
                    <td>First to know about Pana MIA developments</td>
                    <td><GridNotCheck /></td>
                    <td><GridNotCheck /></td>
                    <td><GridCheck /></td>
                  </tr>
                  <tr>
                    <td>Invited into our focus group pool to test new products</td>
                    <td><GridNotCheck /></td>
                    <td><GridNotCheck /></td>
                    <td><GridCheck /></td>
                  </tr>
                </tbody>
              </table>
              
              <div className={styles.formAmountSelections}>
                <h3>Select Your Donation</h3>
                <p style={{textAlign: "center"}}>
                  Select an option below or enter a custom donation amount
                </p>
                <div>
                  <p><strong>Recurring Donation</strong></p>
                  <PanaButton
                      color={(monthlyTier == 1 && isRecurring) ? "navy" : "navy"}
                      hoverColor="navy"
                      onClick={() => { setAmount(10); setIsRecurring(true); }}
                    ><span className={styles.buttonBadgeBlue}><IconMedal size="18" /></span>&nbsp;$10/month</PanaButton>
                  <PanaButton
                      color={(monthlyTier == 2 && isRecurring) ? "navy" : "navy"}
                      hoverColor="navy"
                      onClick={() => { setAmount(15); setIsRecurring(true); }}
                    ><span className={styles.buttonBadgeYellow}><IconTrophy size="18" /></span>&nbsp;$15/month</PanaButton>
                  <PanaButton
                      color={(monthlyTier == 3 && isRecurring) ? "navy" : "navy"}
                      hoverColor="navy"
                      onClick={() => { setAmount(25); setIsRecurring(true); }}
                    ><span className={styles.buttonBadgePink}><IconCrown size="18" /></span>&nbsp;$25/month</PanaButton>
                </div>
                <div>
                  <p><strong>One-Time Donation</strong></p>
                  {preAmounts.map((presetAmount) => (
                      <PanaButton
                        text={"$" + presetAmount}
                        key={presetAmount}
                        color="navy"
                        hoverColor="navy"
                        type="button"
                        onClick={() => {setAmount(presetAmount);setIsRecurring(false)}}
                      />
                    ))} 
                    <PanaButton
                      text="Custom"
                      color="gray"
                      hoverColor="navy"
                      type="button"
                      onClick={() => {focusCustomAmountInput();setIsRecurring(false)}}
                    />
                </div>
              </div>
              <div className={styles.donationForm}>
                <div className={styles.formAmountFields}>
                  <div style={{maxWidth: "125px"}}>
                    <label>Amount:</label>
                    <input
                      ref={customAmountInputRef}
                      type="number"
                      step={0.01}
                      pattern="^\$\d{1,3}(,\d{3})*(\.\d+)?$"
                      placeholder="Custom Amount"
                      value={amount !== 0 ? amount : ''}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className={styles.customAmountInput}
                    />
                  </div>
                  <div>
                    <label>Recurring</label><br />
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      />
                  </div>
                  <div style={{width: "200px"}}>
                    <label>Subscription</label><br />
                    <TierBadge tier={monthlyTier} />
                  </div>
                </div>
                <div className={styles.formNoteFields}>
                  <br />
                  <div>
                    <label>Email:</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      className={styles.emailInput}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <br />
                  <div>
                  <label>Dedicate Donation To:</label>
                  <select
                    defaultValue=""
                    onChange={(e) => setDedicate(e.target.value)}
                  >
                    <option value="">- No Dedication -</option>
                    <option value="Directory">Directory</option>
                    <option value="Other">Other (please describe)</option>
                  </select>
                  </div>
                  <br />
                  <div>
                    <label>Comments:</label>
                    <textarea
                      id="comment"
                      rows={1}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className={styles.commentTextarea}
                      placeholder="Any comment?"
                      ></textarea>
                  </div>
                </div>
                <br />
                <div>
                  <label>Donate Anonymously</label>&nbsp;
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className={styles.checkboxInput}
                  />
                </div>
                
              </div>
              <div className={styles.formGroup}>
                
                
              </div>
              <div className={styles.submit}>
                <PanaButton
                  text="Make My Donation"
                  color="navy"
                  hoverColor={allReqFields ? "navy" : "gray"}
                  type="submit"
                  disabled={!allReqFields}
                />
              </div>
            </form>
          </div>
        </section>
        <div className={styles.footer}></div>
      </div>
    </main>
  );
};

export default DonatePage;