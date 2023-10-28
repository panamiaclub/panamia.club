import type { NextPage } from 'next'
import Link from 'next/link'
import Router from "next/router";

import styles from '../styles/Home2.module.css'
import HeroBar from '../components/HeroBar';
import PanaButton from '../components/PanaButton';

const Home: NextPage = () => {

  // Header Hero
  // Directory Search
  // About (compact version) + Mission Statement
  // Upcoming Events
  // Link To Gift Guide
  // Gallery
  // Featured Panas
  // Goals


  return (
    <div className={styles.App} >
        <section className={styles.headerHero}>
          <div className={styles.headerHeroOverlay}>
            <div className={styles.hero}>
              <div className={styles.heroTitles}>
                <h2>
                  <span className="text-pana-pink">Pana Mia</span>
                  <span className="text-pana-blue">&nbsp;Club</span>
                </h2>
                <h3>All things Local in <span className="text-pana-yellow">SoFlo</span></h3>
              </div>
              <div className={styles.directorySearch}>
                <h3>Search Our Directory</h3>
                <form className={styles.directorySearchForm}>
                  <input 
                    type="search"
                    placeholder="Search by name, category, products"
                    className={styles.directorySearchField} />
                    <PanaButton href="/directorio" color="blue" text="Search Our Directory" />
                </form>
              </div>
            </div>

            <div className={styles.backgroundBar} hidden>
              <div className={styles.backgroundBarInner}>
                <img src="/2023_logo_white.svg" />
                <img src="/2023_logo_white.svg" />
                <img src="/2023_logo_white.svg" />
              </div>
            </div>
          </div>
        </section>
        <section className={styles.whatIsContainer}>
          <div className={styles.whatIsHero}>
            <h2>What is Pana MIA Club actually?</h2>
            <h3>Pana MIA Club is a community platform that makes all things <em>local</em> accessible.</h3>
            <p><u>Connecting the SoFlo Community to its own vibrant &amp; innovative creators/entrepeneurs</u></p>
            <ul className={styles.whatIsList}>
              <li><strong>PASO UNO:</strong><br />We create profiles on local South Florida creatives and entrepeneurs for our Directorio - a publically accessible list</li>
              <li><strong>PASO DOS:</strong><br />We build a community of Panas that support each other, collaborate, and grow together</li>
              <li><strong>PASO TRES:</strong><br />Lured by all the super cool locals in our directory, SoFlo patrons will have no choice but to contribute to the local economy</li>
            </ul>
          </div>
        </section>
        <section className={styles.becomePanaContainer}>
          <div className={styles.becomePanaBar}>
            <div>Join our free local directory today!</div>
            <div>
              <PanaButton href="/become-a-pana" text="Become A Pana" color="yellow" />
            </div>
          </div>
        </section>
        <section className={styles.queTalContainer}>
          <div className={styles.queTalHero}>
            <h2>¿¿Que Tal Pana??</h2>
            <h3>Being a small business owner may be really overwhelming and isolating at times, but you aren't alone.</h3>
            <p>Miami is filled with small vendors, all with different strengths and skillsets. We started Pana Mia as a way to bring everyone together, to pool our resources, insights and strategies. As consumers start recognizing the benefits of shopping local, we want to create a centralized space where they can explore and fall in love with local brands.</p>
          </div>
        </section>
        <section className={styles.eventsContainer}>
          <div className={styles.eventsHero}>
            <div className={styles.eventsImagePanel}>
              <picture>
                <source srcSet="/home/EventsBanner.webp" type="image/webp" media="(min-width: 600px)" />
                <img src="/home/EventsBannerMobilex800.webp" className={styles.eventsImage} />
              </picture>
            </div>
            <div className={styles.eventsDescPanel}>
              <h2>Community Events!</h2>
              <h3>Connecting the SoFlo Community to its own vibrant &amp; innovative creators/entrepeneurs</h3>
              <PanaButton href="https://shotgun.live/venues/pana-mia-club" text="Events" color="yellow" />
            </div>
          </div>
        </section>
        <section className={styles.buffer} hidden></section>
    </div>
  )
}

export default Home
