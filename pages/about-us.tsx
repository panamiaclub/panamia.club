import type { NextPage } from 'next';
import { useState } from 'react';
import classNames from 'classnames';
import { IconCash } from '@tabler/icons';
import Link from 'next/link';

import styles from '@/styles/AboutUs2.module.css'
import PanaButton from '@/components/PanaButton';

const ProjectsBlock = () => {

  const [project, setProject] = useState("directorio");

  return (
    <div className={classNames(styles.projectsBlock, project)}>
      <div className={styles.projectsHeader}>
        <h3 
        className={project == "directorio" ? styles.directorioTitleActive : styles.directorioTitle}
        onClick={ (e:any) => {setProject('directorio')}}
        >El Directorio</h3>
        <h3 
        className={project == "leolero" ? styles.leoleroTitleActive : styles.leoleroTitle}
        onClick={ (e:any) => {setProject('leolero')}}
        >LeoLero</h3>
        <h3 
        className={project == "panavizion" ? styles.panavizionTitleActive : styles.panavizionTitle}
        onClick={ (e:any) => {setProject('panavizion')}}
        >PanaVizion</h3>
      </div>
      { project == "directorio" && 
        <p className={styles.directorioBody}>El Directorio is your access guide to everything locally made and occurring in SoFlo! 
        Our online Local Directory, with easy keyword search functionality, allows patrons to 
        find locally sourced solutions for any need or desire. This enhances convenience for 
        consumers when shopping locally and provides increased visibility for local brands, 
        service providers, and organizations. Our objective is to create a tool that will 
        stimulate the local SoFlo economy and advocate for a lifestyle centered around supporting 
        local businesses.</p>
      }
      { project == "leolero" && 
        <p className={styles.leoleroBody}>Discover the vibrant world of LeoLero, our monthly newsletter that brings you a curated 
        selection of exclusive insights. Dive into excerpts from our talented Panas, catch recaps 
        from our podcast, and join engaging conversations led by seasoned experts. Explore topics 
        that resonate with the SoFlo community and stay in the loop with a thoughtfully crafted 
        playlist and a local events calendar for South Florida. LeoLero is your key to the latest 
        happenings, diverse voices, and the heartbeat of our creative community.</p>
      }
      { project == "panavizion"  && 
        <p className={styles.panavizionBody}>PanaVizión serves as a broadcast channel and podcast dedicated to highlighting impactful 
        community leaders in South Florida through curated media content that shares their stories. 
        Our goal is to uncover the rich experiences, talents, and creations that the people of 
        South Florida have to offer. By providing a platform for these stories, we strive to expand 
        the public's perspective and appreciation for the diverse narratives within the community.</p>
      }
      
    </div>
  );
}

const AboutUs: NextPage = () => {
  
  // Hero Image & Vision
  // Mission Statement
  // VIDEO
  // Our Story
  // Our Projects
  // Board
  // Team
  // Support Our Club
  return (
    <main className={styles.app}>
        <div className={styles.main}>
          <section className={styles.header}>
            <h2>About Us</h2>
            <br />
            <h3>The Future is Local</h3>
          </section>
          <section className={styles.sectionMission}>
            <h2>Our Mission</h2>
            <p>...is to unite the diverse working class of South Florida, igniting the creation of regenerative and vibrant economies. By connecting locals and the quality resources, paired with education on the advantages of reinvesting within our own community, we aim to cultivate financial stability, personal engagement, and emphasize the transformative strength of a unified community.</p>
            <h2>Our Vision</h2>
            <h3>The Future is Local</h3>
            <p>Pana MIA Club is a 501(c)(3) non-profit based in South Florida.</p>
          </section>
          <section className={styles.sectionVideo}>
            
          </section>
          <section className={styles.sectionStory}>
            <div className={styles.containerStory}>
              <div className={styles.storyImg}>
                <img src="/img/about/clari_and_anette.webp" />
              </div>
              <div>
                <h2>Our Story</h2>
                <p>In the spring of 2022, Anette and Clari, two emerging entrepreneurs, formed a fated 
                  bond at a Miami market. Despite their differences, their friendship deepened over time, 
                  evolving into an opportunity for something greater than themselves.</p>
                <p>Their shared dreams and mutual support became the catalyst for the creation of Pana 
                  MIA Club, proving that entrepreneurship doesn't have to be a solo journey. Together, 
                  they discovered the power of unity among local entrepreneurs and creatives. Pana MIA's 
                  story began in that unexpected meeting that transformed into the foundation of it all.</p>
              </div>
            </div>
          </section>
          <section className={styles.sectionProjects}>
            <div className={styles.containerProjects}>
              <h2>Our Projects</h2>
              <ProjectsBlock />
            </div>
          </section>

          <section className={styles.sectionBoard}>
            <div className={styles.containerBoard}>
              <h2>Our Board</h2>
              <div className={styles.boardBlock}>
                <div className={styles.boardImg}>
                  <img src="/img/about/anette_mago.jpg" />
                </div>
                <div>
                  <h3>Anette Mago, Co-Founder</h3>
                  <p>Anette Mago, a Venezuelan-American conceptual artist raised in South Florida, has long 
                    been fascinated by the multicultural landscape and vibrant community of her home state. 
                    Having graduated from the University of Florida in Visual Art Studies in 2021, she delved 
                    into the Miami art scene while establishing her artwear brand, Alobebi. Two years into her 
                    entrepreneurial journey, Anette formed a close bond with Claribel, another small business 
                    owner. Recognizing the importance of a supportive community, Anette's realization led to 
                    the creation of Pana MIA Club, her most ambitious art project to date.</p>
                </div>
              </div>
              
              <div className={styles.boardBlock}>
                <div className={styles.boardImg}>
                <img src="/img/about/claribel_avila.jpg" />
                </div>
                <div>
                  <h3>Claribel Avila, Co-Founder</h3>
                  <p>Claribel Avila is a Puerto Rican entrepreneur and creative who began calling Miami home 
                    in 2021. They graduated from Northeastern University in 2018 with a Bachelors in Economic 
                    Policy. Having been raised by an entrepreneurial migrant family, they explored diverse 
                    industries and started their first business in 2019, selling herbal-infused honey. Despite 
                    their many passions and personal pursuits, their central focus has always been social, 
                    economic and racial justice. Moving to Miami brought purpose, and as a problem solver, 
                    their work with Pana MIA Club soon became a way to leverage strengths in order to bring 
                    about a more equitable and humane world.</p>
                </div>
              </div>
            </div>
          </section>
          <section className={styles.sectionTeam}>
            <div className={styles.containerTeam}>
              <h2>Our Team</h2>
              <div className={styles.teamBlocks}>
                <div className={styles.teamPicture}>
                  <img src="/img/about/bee_maria.jpg" />
                  <h3>Bee Maria<br /><small>Copywriter</small></h3>
                </div>
                <div className={styles.teamPicture}>
                  <img src="/img/about/jdowns.jpg" />
                  <h3>Jeremy Downs<br /><small>Technical Advisor</small></h3>
                </div>
                <div className={styles.teamPicture}>
                  <img src="/img/about/gbarrios.jpg" />
                  <h3>Genesis Barrios<br /><small>Web Developer</small></h3>
                </div>
                <div className={styles.teamPicture} hidden>
                  <img src="/img/about/bee_maria.jpg" />
                  <h3>Bryan Torres<br /><small>Branding Director</small></h3>
                </div>
                <div className={styles.teamPicture} hidden>
                  <img src="/img/about/bee_maria.jpg" />
                  <h3>Otto Munos<br /><small>Head Event Coordinator</small></h3>
                </div>
                <div className={styles.teamPicture} hidden>
                  <img src="/img/about/bee_maria.jpg" />
                  <h3>Jose Sifuentes<br /><small>Branding</small></h3>
                </div>
              </div>
            </div>
          </section>
          <section className={styles.sectionMap} hidden>
            <div className={styles.mapImg}>
              <img src="/img/about/florida_panamia2.jpg" />
            </div>
          </section>
          <section className={styles.sectionSupport}>
            <div className={styles.containerSupport}>
              <div className={styles.mapImg}>
                <img src="/img/about/floridamap_panamia.jpg" />
              </div>
              <div>
                <h2>Support Our Club</h2>
                <p>Pana MIA Club works hard towards our vision for a unified local SoFlo community 
                  everyday. We know we can do it with your help! You can support us by funding our 
                  mission with a one-time donation or by joining our community of supporters called 
                  Gente dePana!</p>
                <p>
                  <PanaButton color="pink" href="/donate/">
                  Help Fund Our<br />Open-Access Local's Directory
                  </PanaButton>
                </p>
                <p>Our Gente dePana subscribers are the foundation of Pana MIA's sustainability, monthly 
                  contributions allow us to make bigger strides in our projects to support the local 
                  community. In return, our Gente are rewarded with so many benefits, discounts and perks 
                  that give you special access to all things Pana!</p>
              </div>
            </div>
          </section>
          <div className={styles.footer}>
          </div>
      </div>
  </main>
  )
}

export default AboutUs
