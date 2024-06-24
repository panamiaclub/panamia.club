import type { NextPage } from 'next'
import React from 'react';

import styles from '@/styles/GoogleEmbeddedForm.module.css'
import PageMeta from '@/components/PageMeta';

const JoinTheTeamForm: NextPage = () => {
  return (
    <main className={styles.app}>
      <PageMeta
        title="Join The Team Form"
        desc="A sustainability centric market hosted at the Hub on December 17th. "
        />
      <div className={styles.main}>
      <section>
        <h2 className={styles.formTitle}>Join The Team</h2>
        <p>Passionate about community and local growth? We're looking for enthusiastic contributors to help us transform South Florida! Apply via the form below</p>

        <details className={styles.jobDropdown}>
          <summary><h3>Developer/UX Developer</h3></summary>
          <p>Pana MIA is, at its core, a technological solution, a digital tool to connect and unite local communities. Join the Pana MIA developer community and bring to life digital tools that will transform living and loving locally. Looking for front end developers, UI/UX designers, JS/React developers. Check out our GitHub in our bio. </p>
          <p>Project Examples: Accessible/CoOp Housing Forum, jobs board, optimizing connectivity and accessibility within the platform, community /activism page, site retheme-ing</p>
        </details>
        
        <details className={styles.jobDropdown}>
          <summary><h3>Social Media Manager</h3></summary>
          <p>Do you love connecting on social media and want to help local brands, businesses and creatives?</p>
          <p>Use your storytelling skills to bring awareness to locals making a meaningful impact in their communities. Tap into our growing network and curate the narrative of what it means to live and love South Florida. We're looking for someone creative and consistent.</p>
          <p>Content Pillar: Highlights from our podcast interviews, promoting the adoption of the local directory as a fun tool, educating on the importance of living a more locally minded lifestyle, offering tools and advice to new entrepreneurs and creatives, engaging on social media.</p>
        </details>

        <details className={styles.jobDropdown}>
          <summary><h3>Event Coordinator</h3></summary>
          <p>Pana MIA loves putting on events that promote local arts and culture. If you are interested in creating intentional events that help connect and foster community, consider joining our team as Pana MIA’s event coordinator. You will have access to Pana MIA’s growing network of performers, vendors and venues. </p>
          <p>Event Examples: Art Print Fair, vendor markets, Local Music Festivals, Industry Specific Networking events, Workshops, Education Panels, etc.</p>
          <p><strong>This position is compensated as a percentage of event revenue</strong></p>
        </details>

        <details className={styles.jobDropdown}>
          <summary><h3>Content Producer/Editor</h3></summary>
          <p>Are you an aspiring filmmaker or content creator? Use your storytelling skills to bring awareness to locals making a meaningful impact in their communities. Tap into our growing network and curate the narrative of what it means to live and love South Florida.</p>
          <p>Content Pillars: Highlights from our podcast interviews, promoting the adoption of the local directory as a fun tool, educating on the importance of living a more locally minded lifestyle, offering tools and advice to new entrepreneurs and creatives.</p>
        </details>

        <details className={styles.jobDropdown}>
          <summary><h3>Grant Writer</h3></summary>
          <p>Help us build a sustainable organization! In order for Pana MIA to grow sustainably - we need funds!</p>
          <p>If you're looking to build your portfolio as a grant writer or copywriter- Pana MIA is looking for compelling writers to join our team for this purpose. We're looking for excellent storytellers with a passion for community advocacy.</p>
          <p>Project Examples: Researching and Applying for grants, Assist in Newsletter creation, creating website and email copy that for fundraising purposes.</p>
          <p><strong>This position is compensated as a percentage of awarded grant funds</strong></p>
        </details>

        <details className={styles.jobDropdown}>
          <summary><h3>Community Engagement Affiliate</h3></summary>
          <p>If you're someone looking to gain experience in Public Relations, Communications and/or Community Engagement and are interested in becoming more connected with South Florida community, this is a great role for you. We're looking for someone communicative and organized.</p>
          <p>What You Can Expect: Community outreach, assembly of press kits and sponsorship decks, Pana Relations managing, engaging on social media, affiliate program management, creative campaign ideation</p>
        </details>

        <details className={styles.jobDropdown}>
          <summary><h3>Outreach Partners</h3></summary>
          <p>Are you looking to engage in local South Florida scene more intentionally? Are you out-going or looking to practice public speaking?</p>
          <p>Pana MIA is looking for friendly, community-minded people that want to represent us at events, online and in community. Partners will help us raise awareness of our mission and educate on the importance of supporting local in South Florida, what we do to help and how to support Pana MIA.</p>
          <p>What You Can Expect: Tabling at Events, Content Creation, Community Outreach, Event Volunteering, Content Distribution</p>
        </details>

      </section>
      <br />
      <iframe className={styles.fullFrame} src="https://docs.google.com/forms/d/e/1FAIpQLScD2cLJ7LM8dhcbaArXPRTn1XkA74siZMs-f16rikHiRCVCvg/viewform?embedded=true">Loading...</iframe>
      </div>
  </main>
  )
}

export default JoinTheTeamForm
