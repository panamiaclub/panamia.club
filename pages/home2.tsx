import type { NextPage } from 'next'
import Link from 'next/link'
import Router from "next/router";

import styles from '../styles/Home2.module.css'
import { IconBrandInstagram } from '@tabler/icons'
import HeroBar from '../components/HeroBar';


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
            <div className={styles.backgroundBar}></div>
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
                  <button className={styles.directorySearchSubmit}>Search</button>
                </form>
              </div>
            </div>
            <div className={styles.backgroundBar}></div>
            <br />
            <div className={styles.backgroundBar}></div>
            <br />

            <div className={styles.backgroundBar}>
              <div className={styles.backgroundBarInner}>
                <img src="/2023_logo_white.svg" />
                <img src="/2023_logo_white.svg" />
                <img src="/2023_logo_white.svg" />
              </div>
            </div>
          </div>
        </section>
        <HeroBar />
        <section className={styles.buffer}></section>
    </div>
  )
}

export default Home
