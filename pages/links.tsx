import type { NextPage } from 'next'
import classNames from 'classnames';

import Image from 'next/image'
import styles from '../styles/Links.module.css'
import { IconBrandTwitter, IconBrandInstagram, IconBrandTiktok, IconMail, IconBrandPatreon, IconBrandSpotify } from '@tabler/icons';
import Link from 'next/link';
import { ActionIcon } from '@mantine/core';

import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import {useEffect} from 'react';

import { useState } from 'react';
import React from 'react';


const Links: NextPage = () => {
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
        <div className={styles.main} ref={ref}>
          <section className={styles.header}>
            <span className={styles.logo}>
              <img src="/logo_new_3.png" alt="panamia logo"/>   
            </span>
            <div className={styles.headerTitle}>Pana MIA Club</div>
            <div className={styles.headerDesc}>
            A collective supporting locally-owned entreprenuers and creatives in SoFlo<br />
            ☀️ Yo tu pana, tú la mia. ☀️
            </div>
            <div className={styles.headerIcons}>
              <div className={styles.headerIcon}>
                  <a target="_blank" href="https://twitter.com/panamiaclub">
                    <IconBrandTwitter size={32} stroke={2.5} color='white' />
                  </a>
              </div>
              <div className={styles.headerIcon}>
                  <a target="_blank" href="https://instagram.com/panamiaclub">
                    <IconBrandInstagram size={32} stroke={2.5} color='white' />
                  </a>
              </div>
              <div className={styles.headerIcon}>
                  <a target="_blank" href="https://www.tiktok.com/@panamiaclub">
                    <IconBrandTiktok size={32} stroke={2.5} color='white' />
                  </a>
              </div>
              <div className={styles.headerIcon}>
                  <a target="_blank" href="mailto:panamiaclub@gmail.com">
                    <IconMail size={32} stroke={2.5} color='white' />
                  </a>
              </div>
            </div>
          </section>

          <section className={styles.links}>
            <div className={styles.link}>
              <a target="_blank" href="https://docs.google.com/spreadsheets/d/1FWh_LIroPsu_0Xej-anP0RuIBDp6k8l1cfJ0pq8dQjY/edit?usp=sharing">
              South Florida's Local Directory!  
              </a>
            </div>
            <div className={styles.link}>
              <a target="_blank" href="https://pale-gosling-be7.notion.site/Pana-MIA-Club-Your-Guide-to-Local-e48fb668d93c475ea28fbc365a052503">
              What is Pana MIA Club?<br />
              <small>&iquest;Que es Pana MIA Club?</small>
              </a>
            </div>
            <div className={classNames(styles.link, styles.linkHighlight)}>
              <a target="_blank" href="https://linktr.ee/panamiaclub">
              Become Our Pana!<br />
              <small>Are you a local entrepreneur or creative based in SoFlo? You’re invited to join our open-access Local’s Directory!</small>
              </a>
            </div>
            <div className={classNames(styles.link, styles.linkVideo)}>
              <iframe width="100%" height="315" src="https://www.youtube.com/embed/videoseries?list=PLeszggVMN994u3XNwptIGamQpzrkpeakF" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen=""></iframe>
            </div>
            <div className={styles.link}>
              <a target="_blank" href="https://patreon.com/PanaMIAClub">
              <IconBrandPatreon size={20} stroke={1.5} color='white' />
              &nbsp;Support Us Through Patreon!
              </a>
            </div>
            <div className={classNames(styles.link, styles.linkSpotify)}>
              <a target="_blank" href="https://open.spotify.com/user/316n6afhro32aqcvlcvxv6mrk2ry?si=7c8a5528902e45fc">
              <IconBrandSpotify size={20} stroke={1.5} color='white' />
              &nbsp;Spotify - SoFlo Locals Playlist
              </a>
            </div>
            <div className={styles.link}>
              <a target="_blank" href="https://forms.gle/CPPBnXv4su1bnV6D7">
              Would You Like To Volunteer For Our Club?
              </a>
            </div>
          </section>
          <div className={styles.footer}>

          </div>
      </div>
  </div>
  )
}

export default Links
