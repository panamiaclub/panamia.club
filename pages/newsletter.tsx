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

const Newsletter: NextPage = () => {
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [alert, setAlert] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [otherURL, setOtherURL] = useState("");
  const [membership, setMembership] = useState("");

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
    if(membership){
     console.log(membership); 
    }
    if(name){
      console.log(name);
    }
    if(email){
      console.log(email);
    }
    if(igUsername){
      console.log(igUsername);
    }
    if(otherURL){
      console.log(otherURL);
    }
  }, [membership, name, email, igUsername, otherURL]);

  const createNewsletterEntry = async () => {
    console.log('create newsletter fired')
    if(name && email && membership && igUsername && otherURL){
        const res = await axios
        .post(
            "/api/createNewsletterEntry",
            { name, email, igUsername, otherURL, membership },
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
            setAlert(error.response.data.error);
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
        <div className={styles.mainContainer} ref={ref}>
          <motion.div animate={animation}>
            <Grid  className={styles.formContainer}>
                <Grid.Col span={4} md={4} xs={0}></Grid.Col>
                <Grid.Col span={4} md={4} xs={12}>
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
                      <Field name="name">
                          {() => (
                          <>
                          <Text className={styles.formText}>Name:</Text>
                              <Input
                              value={name}
                              onChange={(e:any) => setName(e.target.value)}
                              placeholder={"Name"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="email">
                          {() => (
                          <>
                          <Text className={styles.formText}>E-mail:</Text>
                              <Input
                              value={email}
                              onChange={(e:any) => setEmail(e.target.value)}
                              placeholder={"Email"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="igUsername">
                          {() => (
                          <>
                          <Text className={styles.formText}>Instagram Username:</Text>
                              <Input
                              value={igUsername}
                              onChange={(e:any) => setIgUsername(e.target.value)}
                              placeholder={"username"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="otherURL">
                          {() => (
                          <>
                           <Text className={styles.formText}>Other URL:</Text>
                              <Input
                              value={otherURL}
                              onChange={(e:any) => setOtherURL(e.target.value)}
                              placeholder={"Other URL"}
                              />
                          </>
                          )}
                      </Field>

                      <Text className={styles.formText}>What Best Describes You?</Text>
                      <Field  value={membership} as="select" className={styles.selectField} name="membershipType" onChange={(e:any) => setMembership(e.target.value)}>
                        <option value="Business/Venue"> An independent locally-owned venue/brick-and-mortar business</option>
                        <option value="Artist/Small Business">A locally based creative/small business/organization</option>
                        <option value="Supporter">A South Florida resident looking to support more local creators</option>
                        <option value="Tourist">A visitor looking to engage with the local SoFlo scene</option>
                      </Field>
                      <Button type="submit" style={{margin:"2% 40%",backgroundColor:"#EE5967"}}>Submit<FiEdit2 style={{marginLeft:"5px"}}/></Button>
                      </Box>
                  </Form>
                    )}
                </Formik>
                 {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                 {success && <Alert color={"green"} style={{marginTop:"5%"}}>{success}</Alert>}
                </Grid.Col>
                <Grid.Col span={4} md={4} xs={0}></Grid.Col>
            </Grid>
          </motion.div>
        </div>
        
  </div>
  )
}

export default Newsletter
