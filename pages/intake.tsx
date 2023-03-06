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

const Intake: NextPage = () => {
  const {data:session, status} = useSession();
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [alert, setAlert] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [username, setUserName] = useState("");
  const [onboardingFormComplete, setOnboardingFormComplete] = useState(Boolean);
  const [category, setCategory] = useState<any>([]);

  const getUser = async() => {
    if(session?.user?.email){
        //console.log(email);
        const res = await axios
        .get(
            "/api/getUser?userEmail="+session?.user?.email,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            //console.log(response.data.data);
            setUserName(response.data.data.username);
            setEmail(response.data.data.email);
            setCategory(response.data.data.category);
            setOnboardingFormComplete(response.data.data.onboardingFormComplete);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
        });
        //console.log(res);
    }
  }

  useEffect(() => {
    if(username){
      console.log(username);
    }
    if(email){
      console.log(email);
    }

    getUser();
  
    }, [onboardingFormComplete, username, email]);

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
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
                <Grid.Col span={6} md={6} xs={12}>
                <h2 style={{color:"#EE5967"}}>Intake Forms</h2>
                <p style={{fontSize:"0.8em"}}>must complete one per category*</p>

                {category && 
                    <div>
                        <>
                            
                            {category.map((str:any, index:number) => {
                                let link = "";
                                 if(str == "Services"){
                                        link = "servicesintake"
                                 }else if(str == "Art"){
                                    link = "artintake"
                                 }else if(str == "Food"){
                                    link = "foodintake"
                                 }else if(str == "Apparel/Accessories"){
                                    link = "apparelintake"
                                 }else if(str == "Collectives/Platform"){
                                    return (<></>);
                                 }else if(str == "Custoner"){
                                    return (<></>);
                                 }

                                return(
                                   
                                    <Link href={link}><Button key={index} style={{margin:"0 20px"}} disabled={onboardingFormComplete}> {str} </Button></Link>
                                );
                            })}
                        </>
                    </div>
                }
                 {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                 {success && <Alert color={"green"} style={{marginTop:"5%"}}>{success}</Alert>}
                </Grid.Col>
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
            </Grid>
          </motion.div>
        </div>
        
  </div>
  )
}

export default Intake
