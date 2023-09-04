import type { NextPage } from 'next'

import styles from '../styles/Podcasts.module.css'
import { IconBrandYoutube } from '@tabler/icons';

import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import React, {useEffect} from 'react';

import CallToActionBar from '../components/CallToActionBar';
import MainHeader from '../components/MainHeader';


const Podcasts: NextPage = () => {
  const {ref, inView} = useInView();
  const animation = useAnimation();

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
        <MainHeader />
        <div className={styles.main} ref={ref}>
          <section className={styles.header}>
            <h2>Pana MIA Club Podcasts</h2>
          </section>
          <section className={styles.videos}>
            <h3>Most Recent Videos</h3>
            <div className={styles.video}>
              <p>Panavizión ft. Julie from Easy Peasy Tattoos & Alexx in Chainss</p>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/IX2z1-_KEJw" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <div className={styles.video}>
              <p>PanaVizión S1E4: Witches of Miami, Bozito, and Vanessa McCoy</p>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/u4Ehz-Jx7Uo" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <div className={styles.video}>
              <p>PanaVizion Interviews Kat from Earth Pallas and Paco from Folktale San Pedro</p>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/QFtX-UczYb0" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <div className={styles.video}>
              <p>PanaVizion Interviews Sarah from Dear Eleanor and Enrique from Stillblue</p>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/Z9nYArpmfpI" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <div className={styles.video}>
              <p>PanaVizion Interviews Chill Otter Co and Golden Flora</p>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/2fmVE_d9L_k" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <div className={styles.video}>
              <p>Punto De Encuentro: Pana MIA Club’s First Official Meet Up</p>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/gTzHxujUxnc" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <p className={styles.channelLink}><a href="https://www.youtube.com/@panamiaclub" target="_blank"  rel="noopener noreferrer">Our Full Youtube Channel&nbsp;<IconBrandYoutube size={32} stroke={2.5} color='white' /></a></p>
          </section>
          <div className={styles.footer}></div>
      </div>
  </div>
  )
}

export default Podcasts
