import type { NextPage } from 'next'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTwitter } from "@fortawesome/free-brands-svg-icons"
import {FiEdit2, FiInstagram, FiArchive, FiTwitter, FiGlobe, FiMail, FiMapPin} from 'react-icons/fi'
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
  const [panas, setPanas] = useState<any[]>([]);

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

  const getFeaturedPanas = async () => {
    const res = await axios
      .get(
        "/api/getFeaturedPanas",
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      )
      .then(async (res) => {
        setPanas(res.data);
      })
      .catch((error) => {
        console.log(error);
      });
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

  useEffect(() => {
    getFeaturedPanas();
  }, []);

  useEffect(() => {
    if(panas){
      console.log(panas);
    }
  }, [panas]);

  const formSubmitSearch = (actions: any) => {
    actions.setSubmitting(false);
  };

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
                  <h1 className={styles.headingBig}>Pana MIA Club: <span style={{color:"#39B6FF"}}> All</span> things Local in <span style={{color:"#fad288"}}>SoFlo</span></h1>
                </Grid.Col>
                <Grid.Col md={2} xs={0}></Grid.Col>
                <Grid.Col md={4} xs={12} style={{marginTop:"3%"}}>
                  {/* <Image src="/macbook.png" height={400} width={500} style={{marginBottom:"10%"}}></Image> */}
                  <h3>Search</h3>
                      <Formik
                          initialValues={{}}
                          validateOnChange={false}
                          validateOnBlur={false}
                          onSubmit={(_, actions) => {
                          formSubmitSearch(actions);
                        }}
                      >
                          {(props) => (
                          <Form >
                              <Box mb={4}>
                                  <Field name="search">
                                      {() => (
                                      <>
                                          <Input
                                          value={search}  style={{width:"50%",marginRight:"20px", display:'inline-block'}}
                                          onChange={(e:any) => setSearch(e.target.value)}
                                          placeholder={"type to explore SoFlo.."}
                                          />
                                      </>
                                      )}
                                  </Field>
                                    
                                    <Link
                                      href={{
                                        pathname: '/directorio',
                                        query: {search: search}// the data
                                      }}
                                    >
                                      <Button type="submit" style={{margin:"0",backgroundColor:"#39B6FF", display:'inline-block'}}>Search</Button> 
                                    </Link>
                              </Box>
                      </Form>
                          )}
                      </Formik>
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
              <Grid.Col md={4} sm={12}><img src="ig_promo_1.jpg" width="80%"></img></Grid.Col>
              <Grid.Col md={4}  sm={12}><img src="ig_promo_2.jpg" width="80%"></img></Grid.Col>
               <Grid.Col md={4} sm={12}><img src="ig_promo_3.jpg" width="80%"></img></Grid.Col>
            </Grid>

            <Grid>
                  <Grid.Col span={4} md={3} xs={3}></Grid.Col>
                  <Grid.Col span={4} md={6} xs={6}>
                  <div>
                      <Link href='/giftguide' target="_blank"><Button style={{backgroundColor:"#FFECC8", color:"#000000", width:"50%", marginBottom:"20%", marginTop:"10%", marginLeft:"25%"}} size='lg'>View Our Gift Guide</Button></Link>
                    </div>
                  </Grid.Col>
                  <Grid.Col span={4} md={3} xs={3}></Grid.Col>
              </Grid>
          </motion.div>
        </div>

        <div style={{minHeight:"100vh"}}>
          <Carousel centerMode={true} centerSlidePercentage={100} infiniteLoop={true}  showThumbs={false} showIndicators={false} swipeable={true}>
            <div>
              <img src="carousel_2.JPG"></img>
            </div>
            <div>
              <img src="carousel_1.JPG"></img>
            </div>
            <div>
              <img src="carousel_3.JPG"></img>
            </div>
            <div>
              <img src="carousel_4.JPG"></img>
            </div>
            <div>
              <img src="carousel_5.JPG"></img>
            </div>
            <div>
              <img src="carousel_6.JPG"></img>
            </div>
            <div>
              <img src="carousel_7.JPG"></img>
            </div>
            <div>
              <img src="carousel_8.JPG"></img>
            </div>
            <div>
              <img src="carousel_9.JPG"></img>
            </div>
            <div>
              <img src="carousel_10.JPG"></img>
            </div>
            <div>
              <img src="carousel_11.JPG"></img>
            </div>
          </Carousel>
        </div>
      
        <div className={styles.featuredPanas} style={{padding:"10% 0"}} >
          <h1 style={{color:"#39B6FF", fontSize:"2.5em"}}>Featured Panas</h1>
          
          
          <Carousel centerMode={true} centerSlidePercentage={25} infiniteLoop={true} swipeable={true}>
          {panas && 
            panas.map((item:any, index:number) => {
              return(
                        <Card className={styles.panascardStyle} key={index}>
                          <Link  href={"/pana/"+item.username} key={item+"link"}>
                              <div style={{cursor:"pointer"}}>
                                  {item.avatar && <img className={styles.avatarFeatured} src={item.avatar} ></img>}
                                  <h3 className={styles.username}>{item.username}</h3>
                                  {item.location && <p> <FiMapPin></FiMapPin> {item.location.toString()}</p>}
                              </div>
                          </Link>
                          {item.bio && <p>{item.bio.substring(0, 400)}</p>}
                          {item.instagramHandle && <span className={styles.socialLink}><Link href={"http://instagram.com/"+item.instagramHandle}><FiInstagram></FiInstagram></Link></span>}
                          {item.twitterHandle && <span className={styles.socialLink}><Link href={"http://twitter.com/"+item.twitterHandle}><FiTwitter></FiTwitter></Link></span>}
                          {item.link1 && <span className={styles.socialLink}><Link href={item.link1}><FiGlobe></FiGlobe></Link></span>}
                          {item.link2 && <span className={styles.socialLink}><Link href={item.link2}><FiGlobe></FiGlobe></Link></span>}
                      
                        </Card>
            )
            })
            }
          </Carousel>
        </div>
        <div>

       

          <div id="Goals" style={{minHeight:"80vh", padding:"0", paddingTop:"5%", marginTop:"0"}} className={styles.GoalsDiv}>
              <h1 className={styles.headingsGOALS} style={{textAlign:"center"}}>GOALS</h1>
              <Grid style={{margin:"0 2%"}} >
                <Grid.Col md={6} xs={12}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                    <img src="directorio.png" width="100px"></img>
                    <h3 >Directory</h3>
                    <p>Vendors perpetually struggle with getting their product in front of their target audience and patrons who want to support local struggle with the convenience of shopping at Big Box stores for everyday errands. Often supporting local is designated to sporadic “events” that fails to provide consistency for either party. Our goal is to meet the needs of both by creating a local directory of small vendors in Miami.</p>
                  </Card>
                </Grid.Col>
                <Grid.Col md={6} xs={12}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                  <img src="community.png" width="100px"></img>
                    <h3>Vendor Community</h3>
                    <p>We would like to be host to an ever-growing and changing active group of local entrepreneurs and artists. Our intention is to host a space where creatives and entrepreneurs in similar or intersecting industries can discuss, ask for help/advice, or even collaborate on projects. It also will allow us to directly reach our members for Club projects and get feedback/suggestions or direct help as we progress.</p>
                  </Card>
                </Grid.Col>
              </Grid>
              <Grid style={{margin:"0 2%"}}>
                <Grid.Col md={6} xs={12}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                  <img src="workshops.png" width="100px"></img>
                    <h3>Vendor Workshops</h3>
                    <p>We started Pana Mia Club as a way to bring everyone together, to pool our resources, insights and strategies. On our signup form, vendors can specify if they want to offer workshops to the community. Topics include general knowledge such as shipping, web design and accounting; or, more industry specific knowledge such as how to take a food product to market, sourcing solutions in apparel, and music production.</p>
                  </Card>
                </Grid.Col>
                <Grid.Col md={6} xs={12}>
                  <Card className={styles.cardStyleGOALS} style={{height:"100%", textAlign:"center"}}>
                  <img src="transparency.png" width="100px"></img>
                    <h3>Market Transparency</h3>
                    <p>It seems like new markets pop up every day. We want to create a database of markets and collect vendor feedback. More info means vendors can make the best decision for their business. Ultimately we could collectively bargain with markets to make vendor fees more fair and equitable.</p>
                  </Card>
                </Grid.Col>
              </Grid>
          </div>
          <div style={{paddingLeft:'45%', backgroundColor:"#FDBB2D", paddingBottom:"10%"}}>
            <Link href='/newsletter' target="_blank"><Button style={{backgroundColor:"#EE5967", color:"#FFFFFF"}} size={'lg'}>Sign Up For Our Newsletter</Button></Link>
          </div>
        </div>
  </div>
  )
}

export default Home
