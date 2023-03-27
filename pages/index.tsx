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
  Grid, Input, Text, Box, Card, Alert
} from '@mantine/core';

import { IconBrandInstagram } from '@tabler/icons'
import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import {useEffect} from 'react';

import { useCallback, useMemo, useState } from 'react';
import axios from "axios";
import React from 'react';
import { Field, Form, Formik } from "formik";
import { TextInput, NumberInput, StylesApiProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import "react-responsive-carousel/lib/styles/carousel.min.css"; // requires a loader
import { Carousel } from 'react-responsive-carousel';

import Router from "next/router";

const Home: NextPage = () => {
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [search, setSearch] = useState("");

  const formSubmit = (actions: any) => {
    actions.setSubmitting(false);
    redirectToDirectorio();
  };

  const redirectToDirectorio = () => {
    const { pathname } = Router;
    if (pathname === "/giftguide") {
      // TODO: redirect to a success register page
      Router.push("/directorio");
    }
  };

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
              
             <Grid>
                <Grid.Col md={6} xs={12}>
                  <h1 className={styles.headingBig}>Your <span style={{color:"#39B6FF"}}>favorite</span> directory for <span style={{color:"#fad288"}}>local</span> creatives.</h1>
                  <Link href='/newsletter' target="_blank"><Button style={{backgroundColor:"#EE5967", color:"#FFFFFF"}} size={'lg'}>Sign Up For Our Newsletter</Button></Link>
                </Grid.Col>
                <Grid.Col md={6} xs={12}>
                  <Image src="/macbook.png" height={400} width={500} style={{marginBottom:"10%"}}></Image>
                </Grid.Col>
            </Grid>
            </motion.div>
        </div>
        <div className={styles.aboutContainer} id="About" ref={ref}>
          <motion.div animate={animation}>
           <Grid>
                <Grid.Col md={2} xs={0}></Grid.Col>
                <Grid.Col  md={8} xs={12}>
                <div className={styles.textSection}>
                  <h1 className={styles.headings2}>¿¿Que Tal Pana??</h1>
                    <h4 className={styles.headings2}>Being a small business owner may be really overwhelming and isolating at times, but you aren’t alone. Miami is filled with small vendors, all with different strengths and skillsets. We started Pana Mia as a way to bring everyone together, to pool our resources, insights and strategies. As consumers start recognizing the benefits of shopping local, we want to create a centralized space where they can explore and fall in love with local brands.</h4>
                </div>
                
                </Grid.Col>
                <Grid.Col md={2} xs={0}></Grid.Col>
            </Grid> 
           
            <Grid style={{marginLeft:"5%"}} className={styles.igPromo}>
              <Grid.Col sm={4}><img src="ig_promo_1.jpg" width="80%"></img></Grid.Col>
              <Grid.Col sm={4}><img src="ig_promo_2.jpg" width="80%"></img></Grid.Col>
               <Grid.Col sm={4}><img src="ig_promo_3.jpg" width="80%"></img></Grid.Col>
            </Grid>

            <Grid>
                  <Grid.Col span={4} md={5} xs={4}></Grid.Col>
                  <Grid.Col span={4} md={2} xs={4}>
                    <div>
                      <Link href='https://instagram.com/panamiaclub' target="_blank"><Button style={{backgroundColor:"#FFECC8", color:"#011D34", width:"100%", marginTop:"20%"}} >Follow Us<IconBrandInstagram style={{marginLeft: "10px"}}></IconBrandInstagram></Button></Link>
                    </div>
                  </Grid.Col>
                  <Grid.Col span={4} md={5} xs={4}></Grid.Col>
              </Grid>
          </motion.div>
        </div>
      
        <div className={styles.featuredPanas}style={{margin:"5% 0"}} >
          <h1 style={{color:"#39B6FF"}}>Featured Panas</h1>
          <Carousel centerMode={true} centerSlidePercentage={30} infiniteLoop={true}>
              <div>
                  <img src="HolisticMami.png" />
                  {/* <p className="legend">Holistic Mami</p> */}
              </div>
              <div>
                  <img src="Mystix.jpg" />
              </div>
              <div>
                  <img src="Igor.jpg" />
              </div>
              <div>
                  <img src="MarreroTarot.png" />
              </div>
              <div>
                  <img src="sugarPlug.png" />
              </div>
              <div>
                  <img src="waxworms.jpg" />
              </div>
              <div>
                  <img src="GirlBossKollections.png" />
              </div>
          </Carousel>
        </div>
        <div>
          
        <div className={styles.giftGuide}>
          <Grid style={{paddingBottom:"10%", marginBottom:"0"}} >
            <Grid.Col sm={3}><img src="tappas.jpg" className={styles.giftguideimage}></img></Grid.Col>
            <Grid.Col sm={3}><img src="pellejones.jpeg" className={styles.giftguideimage}></img></Grid.Col>
            <Grid.Col sm={3}><img src="Crystals.jpeg" className={styles.giftguideimage}></img></Grid.Col>
            <Grid.Col sm={3}><img src="mysticthrift.JPG"  className={styles.giftguideimage}></img></Grid.Col>
          </Grid>

           <Grid>
                  <Grid.Col span={4} md={5} xs={4}></Grid.Col>
                  <Grid.Col span={4} md={2} xs={4}>
                    <div>
                      <Link href='/giftguide' target="_blank"><Button style={{backgroundColor:"#EB5867", color:"#ffffff", width:"100%", marginBottom:"20%"}} size='lg'>View Our Gift Guide</Button></Link>
                    </div>
                  </Grid.Col>
                  <Grid.Col span={4} md={5} xs={4}></Grid.Col>
              </Grid>
            </div>


          <div id="Goals" style={{height:"100vh", padding:"10% 0!important", marginBottom:"0", marginTop:"0"}} className={styles.GoalsDiv}>
              <h1 className={styles.headingsGOALS} style={{textAlign:"center"}}>GOALS</h1>
              <Grid style={{margin:"0 2%"}} >
                <Grid.Col sm={6}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                    <img src="directorio.png" width="100px"></img>
                    <h3 >Directory</h3>
                    <p>Vendors perpetually struggle with getting their product in front of their target audience and patrons who want to support local struggle with the convenience of shopping at Big Box stores for everyday errands. Often supporting local is designated to sporadic “events” that fails to provide consistency for either party. Our goal is to meet the needs of both by creating a local directory of small vendors in Miami.</p>
                  </Card>
                </Grid.Col>
                <Grid.Col sm={6}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                  <img src="community.png" width="100px"></img>
                    <h3>Vendor Community</h3>
                    <p>We would like to be host to an ever-growing and changing active group of local entrepreneurs and artists. Our intention is to host a space where creatives and entrepreneurs in similar or intersecting industries can discuss, ask for help/advice, or even collaborate on projects. It also will allow us to directly reach our members for Club projects and get feedback/suggestions or direct help as we progress.</p>
                  </Card>
                </Grid.Col>
              </Grid>
              <Grid style={{margin:"0 2%"}}>
                <Grid.Col sm={6}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                  <img src="workshops.png" width="100px"></img>
                    <h3>Vendor Workshops</h3>
                    <p>We started Pana Mia Club as a way to bring everyone together, to pool our resources, insights and strategies. On our signup form, vendors can specify if they want to offer workshops to the community. Topics include general knowledge such as shipping, web design and accounting; or, more industry specific knowledge such as how to take a food product to market, sourcing solutions in apparel, and music production.</p>
                  </Card>
                </Grid.Col>
                <Grid.Col sm={6}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                  <img src="transparency.png" width="100px"></img>
                    <h3>Market Transparency</h3>
                    <p>It seems like new markets pop up every day. We want to create a database of markets and collect vendor feedback. More info means vendors can make the best decision for their business. Ultimately we could collectively bargain with markets to make vendor fees more fair and equitable.</p>
                  </Card>
                </Grid.Col>
              </Grid>
          </div>
          <div style={{textAlign:"center", backgroundColor:"#FDBB2D", height:"50vh"}}>
            <Button type="submit" style={{margin:"15% 40%",backgroundColor:"#9D384F"}}><Link href="/directorio">Enter Panalandia</Link></Button>
            </div>
        </div>
  </div>
  )
}

export default Home
