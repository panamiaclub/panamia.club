import type { NextPage } from 'next'
import classNames from 'classnames';

import styles from '../styles/AboutUs.module.css'
import { IconBrandSpotify, IconBrandYoutube, IconBrandPatreon, IconCash } from '@tabler/icons';

import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import React, {useEffect, useState} from 'react';

import CallToActionBar from '../components/CallToActionBar';


const AboutUs: NextPage = () => {
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [alert, setAlert] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    console.log("use effect , inView = " , inView);
    if(inView){
      animation.start({
        x: 0,
        transition: {
          type: "spring",
          duration: 1,
          bounce: 0.3
        }
      })
    }else{
      animation.start({
        x:"-100vw"
      })
    }
  }, [inView]);

  return (
    <div className={styles.app}>
        <div id="call-to-action-bar">
          <CallToActionBar />
        </div>
        <div className={styles.main} ref={ref}>
          <section className={styles.header}>
            <img className={styles.logo} src="/favicon_x256.png" alt="Pana MIA Favicon logo" />
            <h1>Pana MIA Club: Your Guide to Local</h1>
            <br />
            <div className={styles.outline}>
              <ul>
                <li>
                  <a href="#who-is-panamia">Who is Pana MIA Club?</a>
                  <ul>
                    <li><a href="#mission-statement">Mission Statement</a></li>
                    <li><a href="#anette-and-clari">Anette &amp; Clari</a></li>
                  </ul>
                </li>
                <li>
                  <a href="#what-does-panamia">What does Pana MIA Club do?</a>
                  <ul>
                    <li>
                    <a href="#womanifesto">The (Wo)Manifesto</a>
                    </li>
                  </ul>
                </li>
                <li>
                  <a href="#our-ongoing-projects">Our Ongoing Projects:</a>
                  <ul>
                    <li><a href="#el-directorio">El Directorio- Our Online Local's Directory</a></li>
                    <li><a href="#mapa-miami">MaPa Miami</a></li>
                    <li><a href="#panavizion-podcast">PanaVizion: El Todo SoFLo Podcast</a></li>
                  </ul>
                </li>
                <li>
                  <a href="#how-to-register">How to register your business with Pana MIA Club</a>
                </li>
                <li>
                  <a href="#soflo-soundtrack">The SoFlo Soundtrack</a>
                </li>
                <li>
                  <a href="#donate-now">Donate Now</a>
                </li>
              </ul>
            </div>
          </section>
          <section className={styles.body}>
            <a href="#who-is-panamia"><h2 id="who-is-panamia">Who is Pana MIA Club?</h2></a>
            <p>Pana MIA Club is a 501(c)(3) non-profit based in South Florida.</p>
            <p>We are an inclusive South Florida Locals' Directory representing entrepreneurs, creatives and organizations of all backgrounds. Our mission is to empower the local community by providing essential tools to unite resources, insights, reach, and strategies, cultivating a thriving environment for all.</p>
            <p>As consumers start recognizing the benefits of shopping locally, our centralized directory is a place where the public can explore and fall in love with local brands. Created by two small business owners, Pana MIA Club is designed by and for SoFlo creatives & entrepreneurs to come together.</p>
            <p>We live up to our motto in every part of our platform.</p>
            <p><strong>Yo tu Pana, tú la MIA</strong></p>
            <p>I, your friend and you mine.</p>

            <a href="#mission-statement"><h3 id="mission-statement">&para; Mission Statement</h3></a>
            <blockquote>Pana MIA Club is an all-inclusive platform for all things locally-based in South Florida. We are dedicated to closing the gap between Patron and Pana, making it easier than ever to support local. We cross-promote small businesses and creatives using our Locals Directory; a one-stop shop for anything you need (art, food, services, apparel, platforms etc) provided locally, *finally* a centralized space where you can explore and fall in love with local brands all over South Florida.</blockquote>
            
            <a href="#anette-and-clari"><h3 id="anette-and-clari">&para; Anette &amp; Clari</h3></a>
            <p>Clari and Anette met at a Good Vibes Market at the Center for Subtropical Affairs. Anette is an art wear brand owner and art teacher based out of Miramar. Clari is a certified yoga teacher and owns a small honey brand company. Despite the different industries—and the fact that Anette doesn’t like honey, the two started supporting one another. Pana MIA Club is the direct result from realizing we do not have to do everything alone. Local entrepreneurs and creatives are stronger when they collaborate and contribute to our collective knowledge and experiences.</p>
            
            <a href="#what-does-panamia"><h2 id="what-does-panamia">What does Pana MIA Club do?</h2></a>
            <p>So now that you know who we are, what is it we’re trying to do? We have many projects in the works but our first goal is to create our online keyword-searchable Local’s Directory. With over 300 members in our collective, Anette and I are excited to have a website up so local patrons can search through and find their new favorite brands.</p>

            <a href="#womanifesto"><h3 id="womanifesto">&para; The (Wo)Manifesto</h3></a>
            <div className={styles.swipeGallery}>
              <img src="/ig_promo_1.jpg" alt="" />
              <img src="/ig_promo_2.jpg" alt="" />
              <img src="/ig_promo_4.jpg" alt="" />
            </div>

            <a href="#our-ongoing-projects"><h2 id="our-ongoing-projects">Our Ongoing Projects:</h2></a>

            <a href="#el-directorio"><h3 id="el-directorio">&para; El Directorio- Our Online Local's Directory</h3></a>
            <p>The most effective way of converting consumers into local shoppers is by creating systems  they are familiar with. Our online keyword-search Local’s Directory makes it natural for a local patron to enter a keyword search (i.e. “Gluten-free Bakery) and find locally sourced solutions to meet any need/desire. The patron can browse and select any profile they see in search results which will link to a personalized profile of our Pana. These profiles includes an image gallery, descriptive content, contact links and more.</p>
            <p>El Directorio is your all access guide to all things locally-made and happening in So Flo! 🌴</p>

            <a href="#mapa-miami"><h3 id="mapa-miami">&para; MaPa Miami</h3></a>
            <p>Ever searched for somewhere to go on Google Maps? A cafe, a bar, or maybe a retail shop? What if we could search specifically for locally-owned and independent SoFlo businesses? Now there is! MaPa Miami is your Google Maps search for local venues and brick-and-mortar locations all over South Florida.</p>
            <p>MaPa Miami is your all access guide to local in South Florida</p>
            <ul>
              <li>Search these locations on our filterable general search</li>
              <li>Browse through our location tags for different location categories like “Restaurants” or “Retail” directly on Google Maps through Pana MIA’s MaPa page.</li>
              <li>Find profiles on each location with pictures, descriptions, hours, links and other information.</li>
            </ul>

            <a href="#panavizion-podcast"><h3 id="panavizion-podcast">&para; PanaVizion: El Todo SoFLo Podcast</h3></a>
            

            <a href="#how-to-register"><h2 id="how-to-register">How to register your business with Pana MIA Club</h2></a>
            <p>Signing up to join Pana MIA Club is easy and free! All we ask is that you fill out our form. Please find the links below for the 6 categories. If your business fits into more than one category, choose the one that best describes you. We use your answers to create your online profile so please be as detailed as possible when answering the prompts. Pretend you’re introducing your project to our followers for the first time. 🙂</p>
            
            <ol>
              <li><a href="https://docs.google.com/forms/d/e/1FAIpQLScRaDf72JKx5-jx_nbuqVauPEsZjft_KasVPHgTUy3ETxJq8A/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer">Food</a></li>
              <li><a href="https://docs.google.com/forms/d/e/1FAIpQLSd8O18ZJjvgTY-zUXnHRpv0xsSuDine3-XIUC1XziqdTfKfMw/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer">Apparel/Jewelry</a></li>
              <li><a href="https://docs.google.com/forms/d/e/1FAIpQLScRuYdLv1-ony5z5VjCqUpRMihbO9vjdD_HauohSjyI_c6ivA/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer">Consumer Goods</a></li>
              <li><a href="https://docs.google.com/forms/d/e/1FAIpQLSeGFuia9rDFZefGixvxcTVyx6fYTMNUiCEuap3ryyjuJNLf0w/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer">Services/Groups</a></li>
              <li><a href="https://docs.google.com/forms/d/e/1FAIpQLSfTUsnOxSWMjnilVU50Nnq4xdPgurlaIbJA8keNMuZBe0-WwQ/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer">Art</a></li>
              <li><a href="https://docs.google.com/forms/d/e/1FAIpQLSfjrQj7IS4lToILFqPQt6X_1W7utKVE3rIQgMsJhaUqfWsMSQ/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer">Platform/Organizations</a></li>
            </ol>

            <a href="#soflo-soundtrack"><h2 id="soflo-soundtrack">The SoFlo Soundtrack</h2></a>
            <p>Check out our Spotify Local New Music Playlist: SoFlo Sounds. Want to add your own local music? Reach out to us via email at panamiaclub@gmail.com.</p>
            <p className={styles.spotifyFrame}>
              <iframe src="https://open.spotify.com/embed/playlist/1fCbLXVMcd0Kmo23dzj8Km?utm_source=oembed" sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation allow-forms allow-same-origin allow-storage-access-by-user-activation" allowFullScreen></iframe>
            </p>

            <a href="#donate-now"><h2 id="donate-now">Donate Now</h2></a>
            <p className={styles.link}>
              <a target="_blank" rel="noopener noreferrer" href="https://patreon.com/PanaMIAClub">
              <IconBrandPatreon size={20} stroke={1.5} color='white' />
              &nbsp;Support Us Through Patreon!
              </a>
            </p>
            <p className={styles.link}>
              <a target="_blank" rel="noopener noreferrer" href="https://www.gofundme.com/f/panamia-club-help-create-soflo-locals-directory">
              <IconCash size={20} stroke={1.5} color='white' />
              &nbsp;Donate To Our GoFundMe!
              </a>
            </p>
            

          </section>
          <div className={styles.footer}>
          </div>
      </div>
  </div>
  )
}

export default AboutUs
