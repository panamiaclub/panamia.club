import type { NextPage } from 'next'
import Link from 'next/link'

import styles from '@/styles/index2.module.css'
import PanaButton from '@/components/PanaButton';
import PanaProfileCard from '@/components/PanaProfileCard';

const Home: NextPage = () => {

  // Header Hero
    // Directory Search bar 
  // Become A Pana (bar)
  // Featured Panas (3 Panas)
  // Our Story (Anette & Clari pic)
  // PanaVizion (desc & video)
  // LeoLero (Join Our Newsletter)
  // Gallery
  // Donation (Link)
  // FAQ (Link)

  return (
    <div className={styles.App} >
      <section className={styles.headerHero}>
        <div className={styles.headerHeroOverlay}>
          <div className={styles.hero}>
            <div className={styles.heroTitles}>
              <h2>
                <img src="/logos/pana_logo_long_white.png" />
              </h2>
              <h3>The Future is Local in SoFlo</h3>
            </div>
            <div className={styles.directorySearch} hidden>
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
        </div>
      </section>
      <section className={styles.becomePanaContainer}>
        <div className={styles.becomePanaBar}>
          <div>Join our free Locals Directory today!</div>
          <div>
            <PanaButton href="/form/become-a-pana" text="Become A Pana" color="yellow" hoverColor="yellow" />
          </div>
        </div>
      </section>
      <section className={styles.featuredPanasSection}>
        <div className={styles.featuredPanasContainer}>
          <h2>Featured Panas</h2>
          <div className={styles.featuredPanasBlock}>
            <PanaProfileCard 
              name="Raw Figs Pop Up" 
              url="https://www.panamia.club/profile/raw-figs-pop-up/" 
              image="https://panamia.b-cdn.net/profile/raw-figs-pop-up/primary.png" />
            <PanaProfileCard 
              name="Café mezzanotte" 
              url="https://www.panamia.club/profile/cafe-mezzanotte/" 
              image="https://panamia.b-cdn.net/profile/cafe-mezzanotte/primary.png" />
            <PanaProfileCard 
              name="Lavita Treats" 
              url="https://www.panamia.club/profile/lavita-treats/" 
              image="https://panamia.b-cdn.net/profile/lavita-treats/primary.png" />
          </div>
        </div>
      </section>

      <section className={styles.ourStorySection}>
        <div className={styles.ourStoryContainer}>
          <img src="/img/about/clari_and_anette.webp" />
          <h2>Our Story</h2>
          <h3>Learn more about the creation of South Florida's first local directory.</h3>
          <p>Discover how two Miami visionaries united to bridge the gap between the SoFlo 
            Community with its vibrant creators.</p>
        </div>
      </section>
      <section className={styles.eventsContainer}>
        <div className={styles.eventsHero}>
          <div className={styles.eventsImagePanel}>
            <picture>
              <source srcSet="/img/home/EventsBanner.webp" type="image/webp" media="(min-width: 600px)" />
              <img src="/img/home/EventsBannerMobilex800.webp" className={styles.eventsImage} />
            </picture>
          </div>
          <div className={styles.eventsDescPanel}>
            <h2>Community Events!</h2>
            <h3>Pana MIA curates intentional events centered around meaningful connection and the celebration of local culture and art.</h3>
            <PanaButton href="https://shotgun.live/venues/pana-mia-club" text="Events" color="yellow" hoverColor="yellow" />
          </div>
        </div>
      </section>
      <section className={styles.faqContainer} id="home-faq">
        <div className={styles.faqHero}>
          <h2>Frequently Asked Questions</h2>
          <dl className={styles.faqList}>
            <dt>What does Pana Mean?</dt>
            <dd>Pana is a Latine term for friend or homie.</dd>

            <dt>Is this platform free? If so, will it always be free?</dt>
            <dd>Experience the freedom of our platform - forever, completely free! Join
              us in breaking down barriers and empowering local businesses and creatives like never before.</dd>

            <dt>When can I expect the directory on your website to be up and running?</dt>
            <dd>We currently have a team of developers dedicated to working on the directory,
              projected to release this Fall 2023. In order to accelerate the development process, we are
              actively fundraising.</dd>

            <dt>How does Pana MIA work?</dt>
            <dd>South Florida's comprehensive directory allows people to discover
              the essence of supporting local as  lifestyle. Search for services or creatives near you
              in our keyword-searchable directory. Locally based business owners and creatives are welcome
              to join our community and create profiles to showcase their offerings.</dd>

            <dt>How do I sign up?</dt>
            <dd>Simple! Fill out our Google form. <Link href="/become-a-pana">Become a Pana!</Link></dd>

            <dt>What are the perks to being a Pana?</dt>
            <dd>
              <ul>
                <li>Be a part of our open access list of all locally-based creatives and entrepreneurs
                  available to patrons looking to support local
                </li>
                <li>Tag us in your content and we can promote on our platform</li>
                <li>Potentially be featured in our social media, newsletters, and podcast</li>
                <li>More opportunities for collaboration</li>
              </ul>
            </dd>

            <dt>Who can become a Pana?</dt>
            <dd>Any locally-based creatives, organization, or small business can become
              a member of our collective. Eligibility requires residence in Broward, Miami-Dade, or Palm
              Beach County for either yourself or the owner/directory of the business/organization.</dd>

            <dt>Where can I access the directory?</dt>
            <dd>We've crafted a Google Sheets file complete with keyword search capability
              and tags, which you can access through the link in our bio. Our ultimate goal is to onboard
              all locally-owned businesses, transforming the directory into an indispensable lifestyle tool -
              fostering collaborations by connecting businesses and creatives.</dd>

            <dt>What are the Terms & Conditions?</dt>
            <dd>We maintain the authority to remove individuals from the directory
              if they engage in harmful and hateful behavior towards others or the community as a whole.
              <br />
              Becoming a member is straightforward. You need to be a locally owned and operated business
              in South Florida and complete our form.</dd>
          </dl>
        </div>
      </section>
      <section className={styles.buffer} hidden></section>
    </div>
  )
}

export default Home
