import type { NextPage } from 'next'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTwitter } from "@fortawesome/free-brands-svg-icons"
import {
  createStyles,
  Menu,
  Center,
  Header,
  Container,
  Group,
  Button,
  Burger,
  Navbar,
  NavLink,
  Grid
} from '@mantine/core';
import { IconBrandInstagram } from '@tabler/icons'
import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import {useEffect} from 'react';

const Home: NextPage = () => {
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
    <div className={styles.App} >
  
        <div className={styles.titleDiv}>
          <motion.div
            initial="hidden" animate="visible" variants ={{
              hidden :{
                scale: 0.3,
                opacity: 0
              },
              visible: {
                scale: 1,
                opacity: 1,
                transition: {
                  delay: 0.1
                }
              }
            }}>
              <Image src="/logo.png" height={200} width={300}></Image>
              <h2 className={styles.headings}>Your favorite directory for local creatives.</h2>
            </motion.div>
        </div>
        <div className={styles.aboutContainer} id="About" ref={ref}>
          <motion.div animate={animation}>
            <Grid>
                <Grid.Col md={2} xs={0}></Grid.Col>
                <Grid.Col  md={8} xs={12}>
                <div className={styles.textSection}>
                    <h4 className={styles.headings2}>Being a small business owner may be really overwhelming and isolating at times, but you aren’t alone. Miami is filled with small vendors, all with different strengths and skillsets. We started Pana Mia as a way to bring everyone together, to pool our resources, insights and strategies. As consumers start recognizing the benefits of shopping local, we want to create a centralized space where they can explore and fall in love with local brands.</h4>
                </div>
                
                </Grid.Col>
                <Grid.Col md={2} xs={0}></Grid.Col>
            </Grid>
            <Grid>
                <Grid.Col span={4} md={5} xs={4}></Grid.Col>
                <Grid.Col span={4} md={2} xs={4}>
                <div className={styles.textSection}>
                  <Link href='https://instagram.com/panamiaclub' target="_blank"><Button style={{backgroundColor:"#FFECC8", color:"#011D34"}} >Follow Us<IconBrandInstagram style={{marginLeft: "10px"}}></IconBrandInstagram></Button></Link>
                </div>
                
                </Grid.Col>
                <Grid.Col span={4} md={5} xs={4}></Grid.Col>
            </Grid>
          </motion.div>
        </div>
  </div>
  )
}

export default Home
