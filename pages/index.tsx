import type { NextPage } from 'next'
import Link from 'next/link'

import styles from '@/styles/index.module.css'
import PanaButton from '@/components/PanaButton';

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
                <img src="/logos/pana_logo_long_white.png" />
              </h2>
              <h3>All things Local in SoFlo</h3>
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

          <div className={styles.backgroundBar} hidden>
            <div className={styles.backgroundBarInner}>
              <img src="/logos/2023_logo_white.svg" />
              <img src="/logos/2023_logo_white.svg" />
              <img src="/logos/2023_logo_white.svg" />
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
      <section className={styles.whatIsContainer}>
        <div className={styles.whatIsHero}>
          <h2>What is Pana MIA Club actually?</h2>
          <h3>Pana MIA Club is a community platform that makes all things <em>local</em> accessible.</h3>
          <p><u>Connecting the SoFlo Community to its own vibrant &amp; innovative creators/entrepreneurs</u></p>
          <div className={styles.whatIsMission}>
            <h3>Mission Statement</h3>
            <p>We are organizing the South Florida diversified working class to build regenerative and vibrant
              economies. By connecting locals with quality resources and educating on the benefits of reinvesting
              locally, we cultivate financial security, personal engagement, and emphasize the power of a
              unified community.</p>
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
