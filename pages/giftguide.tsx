import type { NextPage } from 'next'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/giftguide.module.css'
import {FiEdit2} from 'react-icons/fi'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTwitter } from "@fortawesome/free-brands-svg-icons"
import {
    createStyles,
    Menu,
    Center,
    Header,
    Container,
    Group,
    Burger,
    Grid, Input, 
    Card,
    Button, Text, Box, Alert
  } from '@mantine/core';
import { IconBrandInstagram } from '@tabler/icons'
import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import {useEffect} from 'react';

import Router from "next/router";
import { Field, Form, Formik } from "formik";
import { TextInput, NumberInput, StylesApiProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import {useSession ,signIn, signOut} from 'next-auth/react';
import { userAgent } from 'next/server';
import { useCallback, useMemo, useState } from 'react';
import axios from "axios";
import React from 'react';
import { IconMathIntegral } from '@tabler/icons';

import { ReactSVG } from 'react-svg'
import svg1 from '../public/CosaHecha/1.svg';

const GiftGuide: NextPage = () => {
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [alert, setAlert] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");

  const formSubmit = (actions: any) => {
    actions.setSubmitting(false);
    createNewsletterEntry();
  };

  const redirectToHome = () => {
    const { pathname } = Router;
    if (pathname === "/giftguide") {
      // TODO: redirect to a success register page
      Router.push("/giftguide");
    }
  };

  useEffect(() => {

  }, []);

  const createNewsletterEntry = async () => {
    if(email){
        const res = await axios
        .post(
            "/api/createNewsletterEntry",
            { email },
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            }
        )
        .then(async () => {
            //redirectToHome();
            setSuccess("Succesfully signed up!")
        })
        .catch((error) => {
            console.log(error);
            setAlert(error);
        });
        console.log(res);
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
    <div className={styles.App}>
  
        
        <img src='/CosaHecha/1.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/2.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/3.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/4.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/5.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/6.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/7.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/8.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/9.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/10.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/11.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/12.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/13.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/14.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/15.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/16.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/17.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/18.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/19.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/20.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/21.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/22.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/23.svg' alt="svg1" width="100%"/>
        <img src='/CosaHecha/24.svg' alt="svg1" width="100%"/>

        <div className={styles.mainContainer} ref={ref}>
          <motion.div animate={animation}>
            <Grid>
                <Grid.Col md={2} xs={0}></Grid.Col>
                <Grid.Col  md={8} xs={12}>
                <div className={styles.textSection}>
               </div>
                
                </Grid.Col>
                <Grid.Col md={2} xs={0}></Grid.Col>
            </Grid>
            <Grid>
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
                <Grid.Col span={6} md={6} xs={12}>
                    <h2 style={{color:"#EE5967"}}>Sign Up For Our Newsletter!</h2>
                <Formik
                    initialValues={{}}
                    validateOnChange={false}
                    validateOnBlur={false}
                    onSubmit={(_, actions) => {
                    formSubmit(actions);
                    }}
                >
                    {(props) => (
                    <Form style={{ width: "100%" }}>
                        <Box mb={4}>
                        <Field name="email">
                            {() => (
                            <>
                                <Input
                                value={email}
                                onChange={(e:any) => setEmail(e.target.value)}
                                placeholder={"Email"}
                                />
                            </>
                            )}
                        </Field>
                        <Button type="submit" style={{margin:"2% 40%",backgroundColor:"#EE5967"}}>Submit<FiEdit2 style={{marginLeft:"5px"}}/></Button>
                        </Box>
                    </Form>
                    )}
                </Formik>
                 {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                 {success && <Alert color={"green"} style={{marginTop:"5%"}}>{success}</Alert>}
                </Grid.Col>
                <Grid.Col span={3} md={6} xs={0}></Grid.Col>
            </Grid>
          </motion.div>
        </div>
  </div>
  )
}

export default GiftGuide
