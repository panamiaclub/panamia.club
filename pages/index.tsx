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
  Grid, Input, Text, Box
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
                  <Link href='/newsletter' target="_blank"><Button style={{backgroundColor:"#EE5967", color:"#FFFFFF"}}>Sign Up For Our Newsletter</Button></Link>
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
        <div className={styles.featuredPanas} >
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
        <div className={styles.searchD} >
          <h1 style={{color:"#004AAD"}}>Search all Local Creators</h1>
          <Formik
                    initialValues={{}}
                    validateOnChange={false}
                    validateOnBlur={false}
                    onSubmit={(_, actions) => {
                    formSubmit(actions);
                    }}
                >
                    {(props) => (
                    <Form style={{ width: "40%", margin: "0 auto" }}>
                      <Box mb={4}>
                      <Field name="search">
                          {() => (
                          <>
                              <Input
                              value={search}
                              onChange={(e:any) => setSearch(e.target.value)}
                              placeholder={"enter keyword(s)"}
                              />
                          </>
                          )}
                      </Field>
                      <Button type="submit" style={{margin:"2% 40%",backgroundColor:"#39B6FF"}}>Search</Button>
                      </Box>
                  </Form>
                    )}
                </Formik>
        </div>
  </div>
  )
}

export default Home
